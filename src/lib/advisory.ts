import type { Analysis, Evidence, Holding } from './types';
import { dateLabel, list, money, number, percent } from './format';

export function mandate(a: Analysis) {
  const services = [...new Set(a.portfolios.map(p => p.InvestmentServiceName || 'Service not supplied'))];
  const pension = services.some(s => /vorsorge|pension|retirement/i.test(s));
  const executionOnly = services.some(s => /execution.only/i.test(s));
  return { pension, executionOnly, label: services.map(s => /vorsorge/i.test(s) ? 'Pension products' : s).join(' · '),
    instruction: pension ? 'Confirm pension withdrawal eligibility and account restrictions before preparing funding options.' : executionOnly ? 'Execution-only scope: clarify the requested service before discussing a personal investment recommendation.' : 'Confirm objectives and applicable mandate before preparing changes.',
    cashLabel: pension ? 'Pension account liquidity · withdrawal eligibility unverified' : 'Reported balance · availability unverified' };
}

export function clientContextEvidence(a: Analysis): Evidence {
  const m = mandate(a);
  return { id: 'client-mandate', type: 'record', title: 'Client mandate and recorded profile', location: `clients.json / ${a.customer.ClientRef} / selected Portfolios + client profile`, date: a.customer.ProfilingDateUtc,
    fields: [{ label: 'Service', value: m.label }, { label: 'Recorded strategy', value: a.strategy }, { label: 'Risk profile', value: a.customer.RiskProfileName || 'Not supplied' }, { label: 'Regulatory classification', value: a.customer.RegulatoryClientTypeName || 'Not supplied' }, { label: 'Last profiling', value: dateLabel(a.customer.ProfilingDateUtc, true) }, { label: 'Liquidity interpretation', value: m.cashLabel }], note: m.instruction };
}

const profileLimitEvidence = (a: Analysis): Evidence => ({
  id: 'profile-limits', type: 'record', title: `${a.customer.RiskProfileName || 'Risk profile'} · supplied limits`,
  location: `reference.json / RiskProfiles[Id=${a.customer.RiskProfileId}]`, date: a.customer.ProfilingDateUtc,
  fields: [{ label: 'Risk profile', value: a.customer.RiskProfileName || 'Not supplied' },
    { label: 'Maximum volatility', value: number(a.riskProfile?.MaxVola) != null ? percent(a.riskProfile!.MaxVola) : 'Not supplied' },
    { label: 'Maximum equity quote', value: number(a.riskProfile?.EquityQuoteInPercent) != null ? percent(a.riskProfile!.EquityQuoteInPercent) : 'Not supplied' },
    { label: 'Maximum product risk class', value: number(a.riskProfile?.MaxPRC) != null ? String(a.riskProfile!.MaxPRC) : 'Not supplied' },
    { label: 'Last profiling', value: dateLabel(a.customer.ProfilingDateUtc, true) }],
  note: 'Supplied profile limits compared with supplied portfolio figures. Neither side is recalculated here, and the suitability decision remains with the adviser.',
});
/** The inputs are supplied records; the comparison itself is calculated here and must not read as a recorded finding. */
const comparisonEvidence = (id: string, title: string, location: string, rows: { label: string; value: string }[]): Evidence => ({
  id, type: 'calculation', title, location, fields: rows,
  note: 'Compass compared two supplied values. This is not an exported rule-engine finding, and it does not by itself establish a suitability breach.',
});
const securityLimitEvidence = (a: Analysis, h: Holding, rows: { label: string; value: string }[], note: string): Evidence => ({
  id: `profile-security:${h.id}`, type: 'record', title: `${h.displayName} · supplied classification`,
  location: `reference.json / Securities[Id=${h.securityId}]`,
  fields: [...rows, { label: 'Portfolio weight', value: a.weightsAvailable ? percent(h.weight, 2) : 'Unavailable: resolve scope' }, { label: 'Account', value: h.portfolio }], note,
});

export interface ProfileBreach { id: string; kind: 'volatility' | 'equity' | 'product-risk-class' | 'sustainability' | 'strategy'; title: string; metric?: string; detail: string; action: string; evidence: Evidence[] }

/** Compares supplied portfolio figures with the client's own supplied profile limits. Reported, not recalculated. */
export function profileReview(a: Analysis): ProfileBreach[] {
  const out: ProfileBreach[] = [];
  const profile = a.riskProfile;
  const limits = profileLimitEvidence(a);
  const source = (portfolioId: number) => a.evidence.filter(e => e.id === `p-${portfolioId}`);
  const weightOf = (hs: Holding[]) => hs.reduce((n, h) => n + h.weight, 0);
  if (profile) {
    const maxVola = number(profile.MaxVola), maxEquity = number(profile.EquityQuoteInPercent), maxPrc = number(profile.MaxPRC), profileLevel = number(profile.RiskLevel);
    for (const p of a.portfolios) {
      const actual = number(p.Volatility);
      if (maxVola != null && actual != null && actual > maxVola) out.push({
        id: `profile-volatility:${p.PortfolioId}`, kind: 'volatility',
        title: `${p.PortfolioNr || 'Portfolio'}: volatility ${percent(actual)} above the profile ceiling`,
        metric: `${percent(actual)} supplied · ${percent(maxVola)} ceiling for ${a.customer.RiskProfileName || 'the recorded profile'}`,
        detail: 'The supplied portfolio volatility is higher than the maximum recorded for this client’s risk profile. Both are supplied snapshot figures; neither has been recalculated here.',
        action: `Verify the current risk figure, then discuss whether the allocation or the recorded profile should change. ${mandate(a).instruction}`,
        evidence: [comparisonEvidence(`profile-volatility-calc:${p.PortfolioId}`, `${p.PortfolioNr || 'Portfolio'} volatility versus profile ceiling`, `clients.json / Portfolios[PortfolioId=${p.PortfolioId}].Volatility vs reference.json / RiskProfiles[Id=${a.customer.RiskProfileId}].MaxVola`,
          [{ label: 'Supplied volatility', value: percent(actual) }, { label: 'Profile maximum', value: percent(maxVola) }, { label: 'Difference', value: `${percent(actual - maxVola)} above the ceiling` }]), limits, ...source(p.PortfolioId)],
      });
      const strategyLevel = Number(/(\d+)/.exec(p.StrategyName || '')?.[1]);
      if (profileLevel != null && Number.isFinite(strategyLevel) && strategyLevel !== profileLevel) out.push({
        id: `profile-strategy:${p.PortfolioId}`, kind: 'strategy',
        title: `${p.PortfolioNr || 'Portfolio'}: ${p.StrategyName} sits ${strategyLevel > profileLevel ? 'above' : 'below'} the recorded risk profile`,
        metric: `Strategy level ${strategyLevel} · profile level ${profileLevel} (${a.customer.RiskProfileName || 'not supplied'})`,
        detail: 'The portfolio’s recorded investment strategy and the client’s recorded risk profile are different levels. The export does not establish which one currently applies.',
        action: `Confirm which record is current, and on what date it was agreed, before preparing a recommendation. ${mandate(a).instruction}`,
        evidence: [comparisonEvidence(`profile-strategy-calc:${p.PortfolioId}`, `${p.PortfolioNr || 'Portfolio'} strategy versus recorded risk profile`, `clients.json / Portfolios[PortfolioId=${p.PortfolioId}].StrategyName vs reference.json / RiskProfiles[Id=${a.customer.RiskProfileId}].RiskLevel`,
          [{ label: 'Portfolio strategy', value: p.StrategyName }, { label: 'Level read from strategy name', value: String(strategyLevel) }, { label: 'Risk profile', value: `${a.customer.RiskProfileName || 'Not supplied'} (level ${profileLevel})` }]), limits, ...source(p.PortfolioId)],
      });
    }
    const equity = a.allocations.filter(x => /shares|equit/i.test(x.label)).reduce((n, x) => n + x.weight, 0);
    if (maxEquity != null && a.weightsAvailable && equity > maxEquity) out.push({
      id: 'profile-equity', kind: 'equity',
      title: `Equity ${percent(equity)} above the ${percent(maxEquity)} profile ceiling`,
      metric: `${percent(equity)} of the selected scope · ${percent(maxEquity)} maximum equity quote`,
      detail: 'Equity share of the selected scope, measured against total reported value with cash and other accounts in the denominator. Supplied asset classifications; unclassified positions are not counted as equity.',
      action: `Confirm the applicable equity limit and its measurement basis, then compare the current allocation with it. ${mandate(a).instruction}`,
      evidence: [comparisonEvidence('profile-equity-calc', 'Equity share versus profile ceiling', `clients.json / ${a.customer.ClientRef} / selected positions grouped by supplied asset class vs reference.json / RiskProfiles[Id=${a.customer.RiskProfileId}].EquityQuoteInPercent`,
        [{ label: 'Equity share of selected scope', value: percent(equity) }, { label: 'Profile maximum', value: percent(maxEquity) }, { label: 'Difference', value: `${percent(equity - maxEquity)} above the ceiling` }, { label: 'Denominator', value: 'Total reported value of the selected scope, including cash and other accounts' }]), limits, ...a.portfolios.flatMap(p => source(p.PortfolioId))],
    });
    const overPrc = a.holdings.filter(h => maxPrc != null && h.productRiskClass != null && h.productRiskClass > maxPrc);
    if (overPrc.length) out.push({
      id: 'profile-product-risk', kind: 'product-risk-class',
      title: `${overPrc.length} position${overPrc.length === 1 ? '' : 's'} above product risk class ${maxPrc}`,
      metric: a.weightsAvailable ? `${percent(weightOf(overPrc))} of the selected scope` : undefined,
      detail: `Supplied product risk classes exceed the maximum recorded for ${a.customer.RiskProfileName || 'this profile'}: ${overPrc.map(h => `${h.displayName} (class ${h.productRiskClass})`).join('; ')}.`,
      action: `Check whether these products were acquired under a different profile or an advised exception, and record the outcome. ${mandate(a).instruction}`,
      evidence: [comparisonEvidence('profile-product-risk-calc', 'Product risk classes above the profile maximum', `reference.json / Securities[].PRC vs reference.json / RiskProfiles[Id=${a.customer.RiskProfileId}].MaxPRC`,
        [{ label: 'Positions above maximum', value: String(overPrc.length) }, { label: 'Profile maximum', value: String(maxPrc) }, { label: 'Combined weight', value: a.weightsAvailable ? percent(weightOf(overPrc)) : 'Unavailable: resolve scope' }]),
        limits, ...overPrc.map(h => securityLimitEvidence(a, h, [{ label: 'Product risk class', value: String(h.productRiskClass) }, { label: 'Profile maximum', value: String(maxPrc) }], 'Supplied product risk class compared with the supplied profile maximum.'))],
    });
  }
  const minScore = number(a.esgProfile?.MinimumPositionLevel);
  const belowEsg = a.holdings.filter(h => minScore != null && h.sustainabilityScore != null && h.sustainabilityScore < minScore);
  if (belowEsg.length) out.push({
    id: 'profile-sustainability', kind: 'sustainability',
    title: `${belowEsg.length} position${belowEsg.length === 1 ? '' : 's'} below the recorded sustainability minimum`,
    metric: `${a.weightsAvailable ? `${percent(weightOf(belowEsg))} of the selected scope · ` : ''}minimum ${minScore!.toFixed(2)} per position`,
    detail: `The client's recorded ESG profile sets a minimum per-position sustainability score. Supplied scores below it: ${belowEsg.map(h => `${h.displayName} (${h.sustainabilityScore!.toFixed(2)})`).join('; ')}. Positions without a supplied score are not assessed.`,
    action: 'Reconfirm the sustainability preference and whether these positions were agreed as exceptions.',
    evidence: [comparisonEvidence('profile-sustainability-calc', 'Sustainability scores below the profile minimum', `reference.json / Securities[].SustainabilityScore vs reference.json / EsgProfiles[Id=${a.customer.EsgProfileId}].MinimumPositionLevel`,
      [{ label: 'Positions below minimum', value: String(belowEsg.length) }, { label: 'Profile minimum', value: minScore!.toFixed(3) }, { label: 'Combined weight', value: a.weightsAvailable ? percent(weightOf(belowEsg)) : 'Unavailable: resolve scope' }, { label: 'Positions without a supplied score', value: String(a.holdings.filter(h => h.sustainabilityScore == null).length) }]),
      { id: 'esg-profile', type: 'record', title: 'Recorded ESG profile', location: `reference.json / EsgProfiles[Id=${a.customer.EsgProfileId}]`, fields: [{ label: 'ESG profile', value: a.customer.EsgProfileName || 'Not supplied' }, { label: 'Minimum position level', value: minScore!.toFixed(3) }], note: 'Supplied ESG profile threshold. Scores are supplied reference values, not a Compass sustainability assessment.' },
      ...belowEsg.map(h => securityLimitEvidence(a, h, [{ label: 'Sustainability score', value: h.sustainabilityScore!.toFixed(2) }, { label: 'Profile minimum', value: minScore!.toFixed(3) }], 'Supplied sustainability score compared with the supplied profile minimum.'))],
  });
  return out;
}

export function aggregateProducts(a: Analysis) {
  const products = new Map<string, { id: string; name: string; isin?: string; weight: number; value: number | null; currency: string; positions: Holding[] }>();
  for (const h of a.holdings) {
    const id = h.isin ? `instrument:${h.isin}` : h.id;
    const p = products.get(id);
    if (p) { p.weight += h.weight; p.value = p.value != null && h.value != null && p.currency === h.currency ? p.value + h.value : null; p.positions.push(h); }
    else products.set(id, { id, name: h.displayName, isin: h.isin, weight: h.weight, value: h.value, currency: h.currency, positions: [h] });
  }
  return [...products.values()].sort((a,b) => b.weight-a.weight);
}

export function productEvidence(a: Analysis, p: ReturnType<typeof aggregateProducts>[number]): Evidence {
  return { id: `product:${p.id}`, type: 'calculation', title: `${p.name} across selected accounts`, location: `clients.json / ${a.customer.ClientRef} / selected SecurityPositions joined by exact ISIN`,
    fields: [{ label: 'Combined portfolio weight', value: a.weightsAvailable ? percent(p.weight,2) : 'Unavailable: resolve scope' }, { label: 'Combined position value', value: a.scopeAmbiguous ? 'Unavailable: resolve scope' : money(p.value,p.currency) }, ...p.positions.map(h=>({label:h.portfolio,value:`${money(h.value,h.currency)} · ${a.weightsAvailable?percent(h.weight,2):'Unknown weight'} of selected scope`}))], note: 'Same verified instrument across positions. This is product exposure, not an issuer-credit-risk estimate. Cross-currency amounts are not added.' };
}

// Applicability comes from the supplied asset classification, not the fund name.
export function lookThrough(h: Holding): { status: 'not-applicable'|'unavailable'|'partial'|'complete'; label: string; reason: string } {
  if (h.instrumentType !== 'Investment fund') return {status:'not-applicable',label:'Product-specific analysis',reason:'Direct instruments do not need a fund-company breakdown; assess their own issuer, asset and product risks.'};
  if (/commodit|specialt/i.test(h.asset)) return {status:'not-applicable',label:'Commodity / specialist product',reason:'A company list is not the default risk lens. Verify the product structure, underlying asset and counterparty exposure.'};
  if (/real estate/i.test(h.asset)) return {status:'not-applicable',label:'Property / property-fund exposure',reason:'Constituents may be property vehicles or funds. Do not present them as operating-company exposure.'};
  if (/bond|fixed income/i.test(h.asset)) return {status:'not-applicable',label:'Fixed-income look-through',reason:'Issuer credit, duration and currency analysis are required; an equity-company list is insufficient.'};
  if (!/shares|equit/i.test(h.asset)) return {status:'unavailable',label:'Underlying asset class unresolved',reason:'Confirm the underlying asset class before choosing the appropriate look-through.'};
  if (!h.fundHoldings) return {status:'unavailable',label:'Equity holdings unavailable',reason:'No dated equity-constituent snapshot is available.'};
  return {status:h.fundHoldings.coverage==='complete'?'complete':'partial',label:h.fundHoldings.coverage==='complete'?'Published full holdings':'Published top holdings',reason:'Original constituent weights are retained; the unpublished remainder is unknown.'};
}

export function referencePriceReview(a: Analysis) {
  // Compare within the shifted case timeline, not against today's real-world date.
  return a.holdings.flatMap(h => {
    const asOf = a.portfolios.find(p => p.PortfolioId===h.portfolioId)?.FactoryDateUtc;
    const ageDays = (Date.parse(asOf)-Date.parse(h.priceDate || ''))/86400000;
    return !h.priceDate || !Number.isFinite(ageDays) || ageDays > 30 || ageDays < -1 ? [{holding:h,ageDays:Number.isFinite(ageDays)?ageDays:null,asOf}] : [];
  });
}

export function allocationReview(a: Analysis) {
  return (a.policyTargets || []).map(policy => {
    const portfolio = a.portfolios.find(p => p.PortfolioId===policy.portfolioId)!;
    const mappings = policy.mappings.filter(m=>m.Dimension==='AssetClass');
    const total = mappings.reduce((n,m)=>n+(number(m.TargetPercentage)||0),0);
    const valid = mappings.length>0 && Math.abs(total-1)<.02 && mappings.every(m=>number(m.TargetPercentage)!=null && m.TargetPercentage>=0 && m.TargetPercentage<=1 && (m.MinPercentage==null || (number(m.MinPercentage)!=null && m.MinPercentage>=0 && m.MinPercentage<=1)) && (m.MaxPercentage==null || (number(m.MaxPercentage)!=null && m.MaxPercentage>=0 && m.MaxPercentage<=1)) && (m.MinPercentage==null || m.TargetPercentage>=m.MinPercentage) && (m.MaxPercentage==null || m.TargetPercentage<=m.MaxPercentage) && (m.MinPercentage==null || m.MaxPercentage==null || m.MinPercentage<=m.MaxPercentage));
    const positions=a.holdings.filter(h=>h.portfolioId===policy.portfolioId);
    const actual=new Map<string,number>();
    let complete=true;
    for(const h of positions) {const raw=list(portfolio.SecurityPositions).find((s,i)=>`holding-${portfolio.PortfolioId}-${i}`===h.id);const w=number(raw?.PortfolioValuePercentage);if(w==null || /not classified/i.test(h.asset))complete=false;else actual.set(h.asset,(actual.get(h.asset)||0)+w);}
    for(const account of list(portfolio.AccountPositions)){const w=number(account.PortfolioValuePercentage);if(w==null || !/^(CHF|EUR|USD|GBP|JPY|CAD|AUD|NZD|SEK|NOK|DKK|SGD|HKD)$/.test(account.Currency || ''))complete=false;else actual.set('Liquidity',(actual.get('Liquidity')||0)+w);}
    const actualTotal=[...actual.values()].reduce((n,w)=>n+w,0);
    if(Math.abs(actualTotal-1)>.02 || [...actual.keys()].some(k=>!mappings.some(m=>m.Category===k)))complete=false;
    const rows=valid && complete ? mappings.map(m=>({name:m.Category as string,actual:actual.get(m.Category)||0,target:m.TargetPercentage as number,min:number(m.MinPercentage),max:number(m.MaxPercentage)})) : [];
    return {portfolioId:policy.portfolioId,name:portfolio.PortfolioNr,rows,valid:valid&&complete,reason:!valid?'No usable allocation policy: targets are absent, inconsistent with bands or do not total 100%.':!complete?'Holdings or account classifications do not reconcile to this policy.':'Source SAA asset-class buckets; compares within this portfolio only.'};
  });
}

export function allocationEvidence(a: Analysis, review: ReturnType<typeof allocationReview>[number]): Evidence {
  return {id:`policy:${review.portfolioId}`,title:`${review.name} · allocation versus policy`,type:'calculation',location:`clients.json / Portfolios[PortfolioId=${review.portfolioId}] + reference.json / StrategicAssetAllocations`,fields:review.rows.map(r=>({label:r.name,value:`Actual ${percent(r.actual)} · target ${percent(r.target)} · range ${r.min==null?'not supplied':percent(r.min)} to ${r.max==null?'not supplied':percent(r.max)}`})),note:review.reason+' Supplied classifications and policy, not a newly approved recommendation.'};
}
