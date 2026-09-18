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
    fields: [{ label: 'Combined portfolio weight', value: a.weightsAvailable ? percent(p.weight,2) : 'Unavailable: resolve scope' }, { label: 'Combined position value', value: a.scopeAmbiguous ? 'Unavailable: resolve scope' : money(p.value,p.currency) }, ...p.positions.map(h=>({label:h.portfolio,value:`${money(h.value,h.currency)} · ${percent(h.weight,2)} of selected scope`}))], note: 'Same verified instrument across positions. This is product exposure, not an issuer-credit-risk estimate. Cross-currency amounts are not added.' };
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
