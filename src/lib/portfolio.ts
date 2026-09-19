import { fundDenominator } from './types';
import { aggregateProducts, productEvidence, lookThrough, referencePriceReview, mandate, clientContextEvidence, allocationReview, allocationEvidence, profileReview } from './advisory';
import type { Analysis, Evidence, FundHoldingSnapshot, Holding, Row } from './types';
import { dateLabel, percent } from './format';

export const ranges = ['1D', '7D', '1M', '1Y'] as const;
export type TimeRange = typeof ranges[number];
export function rangeStart(end: string, range: TimeRange): string {
  const d = new Date(end); const day = d.getUTCDate();
  if (range === '1D' || range === '7D') d.setUTCDate(day - (range === '1D' ? 1 : 7));
  else { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (range === '1M' ? 1 : 12)); const max = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, max)); }
  return d.toISOString().slice(0, 10);
}
export function periodPerformance(a: Analysis, range: TimeRange) {
  const end = a.history.at(-1); const startDate = end ? rangeStart(end.date, range) : '';
  const start = a.history.find(p => p.date.slice(0, 10) === startDate);
  const points = a.history.filter(p => p.date.slice(0, 10) >= startDate);
  const available = !!(start && end && start.value > 0 && points.length >= 2);
  return { start, end, points, startDate, available, change: available ? end!.value / start!.value - 1 : null, amount: available ? end!.value - start!.value : null };
}
export type ExposureKind = 'industry' | 'country' | 'company' | 'region';
export interface Exposure { id: string; name: string; kind: ExposureKind; weight: number; evidence: Evidence[]; via: string[]; contributions: { id: string; name: string; weight: number }[]; isin?: string }
export const companyId = (isin: string | undefined, fallback: string) => isin ? `instrument:${isin}` : fallback;
export const isCompany = (h: Holding) => ['Shares', 'Dividend right certificates', 'Participation certificate'].includes(h.instrumentType);
export const geography: Record<string, string> = { 'Equities Switzerland': 'Switzerland', 'Equities Euroland': 'Euro area', 'Aktien UK': 'United Kingdom', 'Equities EmMa': 'Emerging markets', 'Equities Japan': 'Japan', 'Equities Pacific': 'Pacific', 'Equities North America': 'North America' };
const specificCountries = new Set(['Switzerland', 'United Kingdom', 'Japan']);
const classified = (s?: string) => !!s && !/not classified|unknown|unclassified/i.test(s);
export function referenceRegion(raw?: string, saa?: string): string | undefined {
  const name = (raw && geography[raw]) || saa || raw;
  if (!classified(name) || /^(?:Others|Structured products.*|Precious metals|Bonds? .*|Equities .*)$/i.test(name!)) return undefined;
  return name === 'Great Britain' ? 'United Kingdom' : name;
}
// Keep original indexes for constituents without an ISIN so target and graph IDs remain stable.
export function equityConstituents(h: Holding): [number, FundHoldingSnapshot['holdings'][number]][] {
  if (!['partial', 'complete'].includes(lookThrough(h).status)) return [];
  return (h.fundHoldings?.holdings || []).map((c, i): [number, typeof c] => [i, c])
    .filter(([, c]) => Number.isFinite(c.weight) && c.weight > 0 && c.weight <= 1);
}
export function portfolioExposures(a: Analysis, kind: ExposureKind): Exposure[] {
  if (!a.weightsAvailable) return [];
  const result = new Map<string, Exposure>();
  function put(name: string | undefined, weight: number, h: Holding, evidence: Evidence, id?: string, isin?: string) {
    if (!classified(name) || !Number.isFinite(weight) || weight <= 0) return;
    const key = id || `${kind === 'industry' ? 'sector' : kind}:${name}`;
    const old = result.get(key);
    if (old) {
      old.weight += weight; old.evidence = [...new Map([...old.evidence, evidence].map(e => [e.id, e])).values()]; old.via = [...new Set([...old.via, h.displayName])];
      const existing = old.contributions.find(c => c.id === h.id);
      if (existing) existing.weight += weight; else old.contributions.push({ id: h.id, name: h.displayName, weight });
    }
    else result.set(key, { id: key, name: name!, kind, weight, evidence: [evidence], via: [h.displayName], contributions: [{ id: h.id, name: h.displayName, weight }], isin });
  }
  for (const h of a.holdings) {
    if (!Number.isFinite(h.weight) || h.weight <= 0 || h.weight > 1) continue;
    const fund = h.instrumentType === 'Investment fund';
    if (!fund) {
      if (kind === 'industry') put(h.sector, h.weight, h, h.evidence);
      if (kind === 'country') put(h.country, h.weight, h, h.evidence);
      const region = referenceRegion(h.region, h.saaRegion);
      if (kind === 'region' && region && region !== h.country && !specificCountries.has(region)) put(region, h.weight, h, h.evidence);
      if (kind === 'company' && isCompany(h)) put(h.displayName, h.weight, h, h.evidence, companyId(h.isin, h.id), h.isin);
      continue;
    }
    if (kind === 'industry' && h.fundBreakdown?.total) {
      for (const [name, amount] of Object.entries(h.fundBreakdown.sectors)) put(name, h.weight * amount / fundDenominator(h.fundBreakdown.total), h, categoryEvidence(h, name, amount, 'IndustryName'));
    } else if (kind === 'industry') {
      for (const [i, c] of equityConstituents(h)) put(c.industry, h.weight * c.weight, h, constituentEvidence(h, c, i));
    }
    const mappedCountries = new Set<string>();
    let mappedCountryWeight = 0;
    if ((kind === 'country' || kind === 'region') && h.fundBreakdown?.total) {
      for (const [raw, amount] of Object.entries(h.fundBreakdown.regions)) {
        const name = geography[raw] || raw;
        const share = amount / fundDenominator(h.fundBreakdown.total);
        if (specificCountries.has(name) && Number.isFinite(share) && share > 0) { mappedCountries.add(name); mappedCountryWeight += share; }
        if ((kind === 'region' && !specificCountries.has(name)) || (kind === 'country' && specificCountries.has(name))) put(name, h.weight * share, h, categoryEvidence(h, name, amount, 'CountryGroupName'));
      }
    }
    if (kind === 'country') {
      // Known constituent countries supplement broad regions, never duplicate a whole-country allocation.
      const partial = equityConstituents(h).filter(([, c]) => c.country && !mappedCountries.has(c.country));
      // Different dated sources can disagree. Withhold the inconsistent supplement rather than rescale it.
      if (partial.reduce((sum, [, c]) => sum + c.weight, 0) + mappedCountryWeight <= 1.00001) {
        for (const [i, c] of partial) put(c.country, h.weight*c.weight, h, constituentEvidence(h, c, i));
      }
    }
    if (kind === 'region' && !h.fundBreakdown?.total) {
      for (const [i, c] of equityConstituents(h)) {
        const region = referenceRegion(c.region, c.saaRegion);
        if (region && region !== c.country && !specificCountries.has(region)) put(region, h.weight * c.weight, h, constituentEvidence(h, c, i));
      }
    }
    if (kind === 'company') for (const [i, c] of equityConstituents(h)) {
      put(c.name, h.weight*c.weight, h, constituentEvidence(h, c, i), companyId(c.isin, `underlying:${h.isin || h.id}:${i}`), c.isin);
    }
  }
  return [...result.values()].sort((a,b) => b.weight-a.weight);
}
function constituentEvidence(h: Holding, c: FundHoldingSnapshot['holdings'][number], index: number): Evidence {
  const snapshot = h.fundHoldings!;
  return { id: `constituent:${h.id}:${index}`, title: `${c.name} through ${h.displayName}`, location: snapshot.sourceUrl, date: snapshot.asOf, type: 'calculation', fields: [{ label: 'Fund weight', value: percent(c.weight, 2) }, { label: 'Position weight', value: percent(h.weight, 2) }, { label: 'Approximate portfolio exposure', value: percent(h.weight*c.weight, 2) }, ...(c.country ? [{ label: 'Reference country', value: c.country }] : []), ...(c.classificationEvidence || []).map(e => ({ label: 'Classification source', value: e.location }))], note: 'Position weight × original published constituent weight. Published holdings are not rescaled. Partial country coverage supplements broad regions and overlaps those regions; dimensions must not be added. Position and fund dates may differ.' };
}
function categoryEvidence(h: Holding, name: string, weight: number, field: string): Evidence {
  return { id: `category:${h.id}:${field}:${name}`, title: `${h.displayName} · ${name}`, type: 'calculation', location: `reference.json / FundUnbundlingMappings / FundSecurityId=${h.securityId}`, fields: [{ label: 'Dimension', value: field }, { label: 'Share of fund', value: percent(weight/fundDenominator(h.fundBreakdown!.total), 2) }, { label: 'Share of portfolio', value: percent(h.weight*weight/fundDenominator(h.fundBreakdown!.total), 2) }], note: 'Position weight × category percentage / 100. Only totals within 1 percentage point of 100 are normalized for rounding; missing allocation remains unknown. Country groups may be regions, not individual countries.' };
}
export function violationEvidence(a: Analysis, v: Row): Evidence {
  return { id: `issue-${v.Id}`, title: v.RuleCode || 'Recorded suitability issue', type: 'record', date: v.LastViolatedDateUTC, location: `clients.json / ${a.customer.ClientRef} / SuitabilityViolations[Id=${v.Id}]`, fields: [{ label: 'Rule', value: v.RuleCode || 'Unknown' }, { label: 'Description', value: v.RuleDescription || 'Not supplied' }, { label: 'Severity', value: v.Severity || 'Not supplied' }, { label: 'Recorded inputs', value: typeof v.ViolationPath === 'string' ? v.ViolationPath : JSON.stringify(v.ViolationPath || []) }], note: 'Exported rule-engine finding. Verify whether it remains unresolved; it has not been recomputed.' };
}
export function violationMeasurement(v: Row): string {
  let path: Row[] = []; try { path = typeof v.ViolationPath === 'string' ? JSON.parse(v.ViolationPath) : v.ViolationPath; } catch { return ''; }
  if (!Array.isArray(path)) return '';
  const comparisons = path.filter(r => /Volatility|PortfolioValue/i.test(r.FieldName) && typeof r.LeftValue === 'number' && typeof r.RightValue === 'number' && r.LeftValue >= 0 && r.LeftValue <= 1 && r.RightValue > 0 && r.RightValue <= 1);
  return [...new Set(comparisons.map(row => `${percent(row.LeftValue, 1)} recorded · ${percent(row.RightValue, 1)} rule threshold`))].slice(0, 2).join('; ');
}
// The supplied rule names carry the direction; a breach of a floor and a breach of a ceiling need opposite conversations.
function volatilityAction(records: Row[]): string {
  const codes = records.map(r => String(r.RuleCode || ''));
  const belowRange = codes.some(c => /undershot|too low|minimum/i.test(c));
  const aboveRange = codes.some(c => /exceed|too high|maximum/i.test(c));
  if (belowRange && aboveRange) return 'These records point in opposite directions. Read each rule and its recorded values before proposing any change to portfolio risk.';
  if (belowRange) return 'The recorded finding is that portfolio risk sits below the agreed range, not above it. Reconfirm the target risk level and horizon before treating the allocation as too defensive.';
  if (aboveRange) return 'Reconfirm loss tolerance and the recorded risk profile; compare a lower-risk allocation only after validating the supplied limit.';
  return 'The supplied rule does not state a direction. Read the recorded values before proposing any change to portfolio risk.';
}
export interface AttentionItem { id: string; level: 'critical' | 'review' | 'gap'; label: string; title: string; detail: string; action: string; evidence: Evidence[]; findingId?: string; contextId?: string; metric?: string; graphNodeId?: string }
export function portfolioAttention(a: Analysis): AttentionItem[] {
  const items: AttentionItem[] = [];
  for(const p of a.portfolios.filter(p=>p.ExternalSource)){const unresolved=p.SecurityPositions.filter((s:Row)=>s.IdentityIssue);if(unresolved.length)items.push({id:`external-identity:${p.PortfolioId}`,level:'gap',label:'Import review',title:`${unresolved.length} statement identifiers need review`,detail:'Reported holdings and values are preserved. Invalid or conflicting ISINs are excluded from automatic matching.',action:'Check identifiers against the original statement before resolving companies or fund holdings.',evidence:a.holdings.filter(h=>h.portfolioId===p.PortfolioId&&unresolved.some((s:Row)=>s.SecurityId===h.securityId)).map(h=>h.evidence)});}
  if(!a.weightsAvailable&&!a.scopeAmbiguous&&a.holdings.length)items.push({id:'missing-weights',level:'gap',label:'Missing weights',title:'Exposure weights are incomplete',detail:'At least one position weight is missing or invalid; combined exposure and scenarios are withheld.',action:'Obtain complete position weights for this portfolio.',evidence:a.holdings.map(h=>h.evidence)});
  if (a.scopeAmbiguous) items.push({ id: 'scope', level: 'gap', label: 'Resolve scope', title: 'Portfolio scope needs review', detail: 'Portfolios overlap or use incompatible valuation dates or currencies; combined totals and weights are withheld.', action: 'Choose one portfolio in the scope selector.', evidence: a.evidence.filter(e => e.id.startsWith('p-')) });
  // Hard profile limits lead; a recorded preference is reviewed alongside concentration rather than ahead of it.
  const profileBreaches = profileReview(a);
  for (const b of profileBreaches.filter(b => b.kind !== 'sustainability')) items.push({ id:b.id,level:'critical',label:b.kind==='strategy'?'Mandate alignment':'Profile limit',title:b.title,metric:b.metric,detail:b.detail,action:b.action,evidence:b.evidence });
  const family=(rule:string) => /volatility/i.test(rule) ? 'Risk level and volatility' : /currency/i.test(rule) ? 'Currency concentration' : /single financial instrument/i.test(rule) ? 'Single-product concentration' : /equity (region|sector)/i.test(rule) ? 'Allocation drift' : 'Mandate and recorded instructions';
  const grouped = new Map<string, Row[]>();
  for (const v of a.violations) { const key=family(v.RuleCode || ''); grouped.set(key,[...(grouped.get(key)||[]),v]); }
  for (const [title, records] of grouped) {
    const v = records.find(v => v.Severity === 'Error') || records[0];
    // Keep each supplied rule name beside its own measurement; bare numbers do not say which limit or direction.
    const measurements=[...new Set(records.map(r=>{const m=violationMeasurement(r);return m?`${r.RuleCode||'Recorded rule'} — ${m}`:'';}).filter(Boolean))];
    const action = title==='Risk level and volatility' ? volatilityAction(records) : title==='Currency concentration' ? 'Check currency needs and hedge status; compare hedged and unhedged exposure against the recorded limits.' : title==='Single-product concentration' ? 'Review the combined direct and fund exposures, then prepare diversification options within the mandate.' : title==='Allocation drift' ? 'Compare the recorded regional and sector deviations with the agreed policy before proposing rebalancing.' : 'Resolve the recorded instruction or proposal-authorisation issue before proceeding.';
    items.push({ id:`rule:${title}`,level:v.Severity==='Error'?'critical':'review',label:'Recorded findings',title,metric:measurements.slice(0,2).join('; '),detail:`${records.length} source records grouped. ${[...new Set(records.map(r=>r.RuleCode))].join('; ')}. Latest record ${dateLabel([...records].sort((a,b)=>String(b.LastViolatedDateUTC).localeCompare(String(a.LastViolatedDateUTC)))[0].LastViolatedDateUTC,true)}; current resolution unknown.`,action,evidence:records.map(v=>violationEvidence(a,v)),findingId:'recorded-issues'});
  }
  const need = a.findings.find(f => f.id === 'customer-context' && /cash need/i.test(f.title));
  if (need) items.push({ id:'cash-need',level:'review',label:'Customer need',title:'Reconfirm the recorded cash requirement',detail:need.body,action:`${need.question} ${mandate(a).instruction}`,evidence:[...need.evidence,clientContextEvidence(a)],findingId:need.id });
  const products=aggregateProducts(a);
  const largest = products[0];
  if (a.weightsAvailable && largest?.weight>=.2) items.push({id:'product-concentration',level:'review',label:'Product concentration',title:`${largest.name}: ${percent(largest.weight)} combined`,metric:`${largest.positions.length} position${largest.positions.length===1?'':'s'} · same verified instrument`,detail:'Combined across selected accounts by exact ISIN. The 20% review trigger is a demo heuristic, not a suitability limit. Product exposure is not issuer-credit exposure.',action:`Check whether this concentration is intentional and within the agreed limits. ${mandate(a).instruction}`,evidence:[productEvidence(a,largest),...largest.positions.map(h=>h.evidence)],graphNodeId:largest.id});
  const company=portfolioExposures(a,'company')[0];
  if(company?.weight>=.2 && company.weight>(largest?.weight || 0)+.005)items.push({id:'company-concentration',level:'review',label:'Equity exposure',title:`${company.name}: ${percent(company.weight)} direct + indirect`,detail:'Covered equity holdings only. A 20% review trigger is a demo heuristic, not a suitability limit. Share classes remain separate.',action:'Check whether fund holdings duplicate the direct position before preparing diversification options.',evidence:company.evidence,graphNodeId:company.id});
  for (const b of profileBreaches.filter(b => b.kind === 'sustainability')) items.push({ id:b.id,level:'review',label:'Sustainability preference',title:b.title,metric:b.metric,detail:b.detail,action:b.action,evidence:b.evidence });
  const stale=referencePriceReview(a);
  if(stale.length)items.push({id:'price-freshness',level:'review',label:'Data reliability',title:`${stale.length} reference-price dates need verification`,metric:a.weightsAvailable?`${percent(stale.reduce((n,r)=>n+r.holding.weight,0))} of portfolio affected`:undefined,detail:'Security reference dates are missing, later than the portfolio snapshot or more than 30 days older. This does not prove the exported position valuations are stale.',action:'Reconcile reference prices with the portfolio valuation source before using these securities in a proposal.',evidence:stale.map(r=>({...r.holding.evidence,id:`freshness:${r.holding.id}`,fields:[...r.holding.evidence.fields,{label:'Portfolio snapshot',value:dateLabel(r.asOf,true)},{label:'Reference-price age at snapshot',value:r.ageDays==null?'Unknown':`${Math.round(r.ageDays)} days`}]})),graphNodeId:stale[0].holding.isin?`instrument:${stale[0].holding.isin}`:stale[0].holding.id});
  for(const policy of allocationReview(a)) {
    const outside=policy.rows.filter(r=>(r.min!=null && r.actual<r.min-.0001)||(r.max!=null && r.actual>r.max+.0001));
    if(outside.length)items.push({id:`allocation:${policy.portfolioId}`,level:'review',label:'Policy comparison',title:`${policy.name}: ${outside.length} asset classes outside supplied bands`,detail:outside.map(r=>`${r.name}: ${percent(r.actual)} actual, ${percent(r.target)} target`).join('; '),action:'Confirm this is the active policy, then compare a rebalance with the customer’s needs and constraints.',evidence:[allocationEvidence(a,policy)]});
  }
  const funds = a.holdings.filter(h=>h.instrumentType==='Investment fund');
  const missing=products.filter(p=>p.positions.some(h=>lookThrough(h).status==='unavailable'));
  if(missing.length)items.push({id:'coverage',level:'gap',label:'Look-through gap',title:`${missing.length} products need equity look-through or classification`,detail:`${funds.filter(h=>lookThrough(h).status==='not-applicable').length} non-equity fund positions require an asset-specific risk lens instead of an operating-company list.`,action:'Obtain dated equity holdings for applicable funds; assess commodity structure, property exposure or bond risk separately.',evidence:missing.flatMap(p=>p.positions.map(h=>h.evidence))});
  if(a.portfolios.length && allocationReview(a).some(r=>!r.valid))items.push({id:'mandate-policy',level:'gap',label:'Mandate confirmation',title:'Allocation policy needs confirmation',detail:`${mandate(a).label}. ${allocationReview(a).filter(r=>!r.valid).map(r=>`${r.name}: ${r.reason}`).join(' ')}`,action:mandate(a).instruction,evidence:[clientContextEvidence(a),...allocationReview(a).filter(r=>!r.valid).map(r=>allocationEvidence(a,r))]});
  const unknown = a.holdings.filter(h => !h.known);
  if (unknown.length) items.push({ id:'unknown-securities',level:'gap',label:'Missing reference data',title:`${unknown.length} positions cannot be fully classified`,detail:'Their identifiers were not found in the supplied security master. Exposure and news coverage may be incomplete.',action:'Import the matching security reference records.',evidence:unknown.map(h=>h.evidence) });
  if (!a.portfolios.length) items.push({id:'no-portfolios',level:'gap',label:'Missing portfolio',title:'No portfolio records supplied',detail:'There are no holdings or investment values to review for this customer.',action:'Import the customer’s portfolio export.',evidence:[]});
  const rank = { critical: 0, review: 1, gap: 2 };
  return items.sort((a,b) => (a.id === 'scope' ? -1 : rank[a.level])-(b.id === 'scope' ? -1 : rank[b.level]));
}
