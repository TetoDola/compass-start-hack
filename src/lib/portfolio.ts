import type { Analysis, Evidence, Holding, Row } from './types';
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
export interface Exposure { id: string; name: string; kind: ExposureKind; weight: number; evidence: Evidence[]; via: string[]; isin?: string }
export const companyId = (isin: string | undefined, fallback: string) => isin ? `instrument:${isin}` : fallback;
export const isCompany = (h: Holding) => ['Shares', 'Dividend right certificates', 'Participation certificate'].includes(h.instrumentType);
export const geography: Record<string, string> = { 'Equities Switzerland': 'Switzerland', 'Equities Euroland': 'Euro area', 'Aktien UK': 'United Kingdom', 'Equities EmMa': 'Emerging markets', 'Equities Japan': 'Japan', 'Equities Pacific': 'Pacific', 'Equities North America': 'North America' };
const specificCountries = new Set(['Switzerland', 'United Kingdom', 'Japan']);
const classified = (s?: string) => !!s && !/not classified|unknown|unclassified/i.test(s);
export function portfolioExposures(a: Analysis, kind: ExposureKind): Exposure[] {
  if (!a.weightsAvailable) return [];
  const result = new Map<string, Exposure>();
  function put(name: string | undefined, weight: number, h: Holding, evidence: Evidence, id?: string, isin?: string) {
    if (!classified(name) || !Number.isFinite(weight) || weight <= 0) return;
    const key = id || `${kind === 'industry' ? 'sector' : kind}:${name}`;
    const old = result.get(key);
    if (old) { old.weight += weight; old.evidence = [...new Map([...old.evidence, evidence].map(e => [e.id, e])).values()]; old.via = [...new Set([...old.via, h.displayName])]; }
    else result.set(key, { id: key, name: name!, kind, weight, evidence: [evidence], via: [h.displayName], isin });
  }
  for (const h of a.holdings) {
    const fund = h.instrumentType === 'Investment fund';
    if (!fund) {
      if (kind === 'industry') put(h.sector, h.weight, h, h.evidence);
      if (kind === 'country') put(h.country, h.weight, h, h.evidence);
      if (kind === 'company' && isCompany(h)) put(h.displayName, h.weight, h, h.evidence, companyId(h.isin, h.id), h.isin);
      continue;
    }
    if (kind === 'industry' && h.fundBreakdown?.total) {
      for (const [name, amount] of Object.entries(h.fundBreakdown.sectors)) put(name, h.weight * amount / h.fundBreakdown.total, h, categoryEvidence(h, name, amount, 'IndustryName'));
    }
    if ((kind === 'country' || kind === 'region') && h.fundBreakdown?.total) {
      for (const [raw, amount] of Object.entries(h.fundBreakdown.regions)) {
        const name = geography[raw] || raw;
        if (kind === 'region' || specificCountries.has(name)) put(name, h.weight * amount / h.fundBreakdown.total, h, categoryEvidence(h, name, amount, 'CountryGroupName'));
      }
    } else if (kind === 'country') {
      // Without a geographic breakdown, classify only constituents with an exact master-data match.
      for (const c of h.fundHoldings?.holdings.slice(0,10) || []) if (c.country) put(c.country, h.weight*c.weight, h, h.evidence);
    }
    if (kind === 'company') for (const [i, c] of (h.fundHoldings?.holdings.slice(0, 10) || []).entries()) {
      const snapshot = h.fundHoldings!;
      const e: Evidence = { id: `constituent:${h.id}:${i}`, title: `${c.name} through ${h.displayName}`, location: snapshot.sourceUrl, date: snapshot.asOf, type: 'calculation', fields: [{ label: 'Fund weight', value: percent(c.weight, 2) }, { label: 'Position weight', value: percent(h.weight, 2) }, { label: 'Approximate portfolio exposure', value: percent(h.weight*c.weight, 2) }], note: 'Position weight × original published constituent weight. Top ten are not rescaled. Position and fund dates may differ.' };
      put(c.name, h.weight*c.weight, h, e, companyId(c.isin, `underlying:${h.isin || h.id}:${i}`), c.isin);
    }
  }
  return [...result.values()].sort((a,b) => b.weight-a.weight);
}
function categoryEvidence(h: Holding, name: string, weight: number, field: string): Evidence {
  return { id: `category:${h.id}:${field}:${name}`, title: `${h.displayName} · ${name}`, type: 'calculation', location: `reference.json / FundUnbundlingMappings / FundSecurityId=${h.securityId}`, fields: [{ label: 'Dimension', value: field }, { label: 'Share of fund', value: percent(weight/h.fundBreakdown!.total, 2) }, { label: 'Share of portfolio', value: percent(h.weight*weight/h.fundBreakdown!.total, 2) }], note: 'Position weight × category weight ÷ supplied fund breakdown total. Country groups may be regions, not individual countries.' };
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
export interface AttentionItem { id: string; level: 'critical' | 'review' | 'gap'; label: string; title: string; detail: string; action: string; evidence: Evidence[]; findingId?: string; contextId?: string; metric?: string }
export function portfolioAttention(a: Analysis): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (a.scopeAmbiguous) items.push({ id: 'scope', level: 'gap', label: 'Resolve scope', title: 'Consolidated portfolios may overlap', detail: 'Combined totals and weights could double-count assets.', action: 'Choose one portfolio in the scope selector.', evidence: a.evidence.filter(e => e.id.startsWith('p-')) });
  const grouped = new Map<string, Row[]>();
  for (const v of a.violations) { const key = v.RuleCode || 'Recorded suitability issue'; grouped.set(key, [...(grouped.get(key) || []), v]); }
  for (const [title, records] of grouped) {
    const v = records.find(v => v.Severity === 'Error') || records[0];
    items.push({ id: `rule:${title}`, level: v.Severity === 'Error' ? 'critical' : 'review', label: v.Severity === 'Error' ? 'Recorded breach' : 'Recorded warning', title, metric: violationMeasurement(v), detail: `${records.length} supplied record${records.length === 1 ? '' : 's'} · ${dateLabel(v.LastViolatedDateUTC, true)}. Current resolution is unknown.`, action: 'Check the recorded limit and whether the issue is still open.', evidence: records.map(v => violationEvidence(a,v)), findingId: 'recorded-issues' });
  }
  const largest = portfolioExposures(a, 'company')[0];
  if (largest?.weight >= .2) items.push({ id: 'company-concentration', level: 'review', label: 'Concentration', title: `${largest.name} accounts for ${percent(largest.weight)}`, detail: 'Direct and covered fund holdings combined. A 20% review trigger is a demo heuristic, not a suitability limit.', action: 'Compare the combined exposure with the customer’s agreed limits.', metric: percent(largest.weight), evidence: largest.evidence });
  const need = a.findings.find(f => f.id === 'customer-context' && /cash need/i.test(f.title));
  if (need) items.push({ id: 'cash-need', level: 'review', label: 'Customer need', title: 'Reconfirm the recorded cash requirement', detail: need.body, action: need.question, evidence: need.evidence, findingId: need.id });
  const funds = a.holdings.filter(h => h.instrumentType === 'Investment fund');
  const missing = funds.filter(h => !h.fundHoldings);
  if (missing.length) items.push({ id: 'coverage', level: 'gap', label: 'Coverage gap', title: `${missing.length} fund${missing.length === 1 ? '' : 's'} without company holdings`, detail: 'Company-level risks inside these funds cannot be screened yet.', action: 'Refresh the fund holdings or request the issuer’s current list.', evidence: missing.map(h => h.evidence) });
  const unknown = a.holdings.filter(h => !h.known);
  if (unknown.length) items.push({ id:'unknown-securities',level:'gap',label:'Missing reference data',title:`${unknown.length} positions cannot be fully classified`,detail:'Their identifiers were not found in the supplied security master. Exposure and news coverage may be incomplete.',action:'Import the matching security reference records.',evidence:unknown.map(h=>h.evidence) });
  if (!a.portfolios.length) items.push({id:'no-portfolios',level:'gap',label:'Missing portfolio',title:'No portfolio records supplied',detail:'There are no holdings or investment values to review for this customer.',action:'Import the customer’s portfolio export.',evidence:[]});
  const rank = { critical: 0, review: 1, gap: 2 };
  return items.sort((a,b) => (a.id === 'scope' ? -1 : rank[a.level])-(b.id === 'scope' ? -1 : rank[b.level]));
}
