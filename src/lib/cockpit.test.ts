import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './analysis';
import { breakdownRows, cockpitPrompts, portfolioEvents, riskContributors, saaTargets } from './cockpit';
import type { Dataset, Row } from './types';
import { newsTargets, type MarketContext } from './briefing';
const data: Dataset = JSON.parse(readFileSync('public/data/case-data.json', 'utf8'));
const customer = data.clients.find(c => c.ClientRef === 'CASE-038')!;
const advisory = customer.Portfolios.find((p: Row) => p.PortfolioNr === 'CASE-038-02')!;
const single = analyze(data, customer, String(advisory.PortfolioId));
const combined = analyze(data, customer);

test('policy targets are read for a single portfolio only, and never for an untargeted dimension', () => {
  const industry = saaTargets(single, data, 'industry');
  assert.ok(industry.get('Health Care')! > 0.2);
  assert.equal(saaTargets(single, data, 'company').size, 0);
  // Two overlapping portfolios have no single policy to compare against.
  assert.equal(saaTargets(combined, data, 'industry').size, 0);
});

test('a breakdown row carries a deviation only for a compatible policy bucket', () => {
  const rows = breakdownRows(single, data, 'industry');
  for (const row of rows) {
    assert.equal(row.target == null, row.deviation == null);
    if(row.target!=null)assert.equal(row.deviation,row.weight-row.target);
  }
  for (const row of breakdownRows(single, data, 'company')) assert.equal(row.target, null);
});

test('a recorded finding is attached to the exposure its rule names, and only that one', () => {
  const rows = breakdownRows(single, data, 'industry');
  const flagged = rows.filter(r => r.violation);
  assert.ok(flagged.length, 'the supplied case flags at least one industry');
  for (const row of flagged) assert.ok(String(row.violation!.RuleCode).includes(`"${row.name}"`));
  assert.ok(rows.some(r => !r.violation), 'unflagged rows stay unflagged');
});

test('risk contributors use the supplied volatility contribution, ranked and never negative', () => {
  const ranked = riskContributors(single);
  assert.ok(ranked.length > 3);
  for (const [i, holding] of ranked.entries()) {
    assert.ok(holding.riskContribution! > 0);
    if (i) assert.ok(holding.riskContribution! <= ranked[i - 1].riskContribution!);
  }
  // A contribution is a share of risk, not of value: the two rankings need not agree.
  assert.ok(ranked.every(h => h.weight >= 0));
});

test('events and prompts stay empty-safe without news, and prompts trace back to a record', () => {
  assert.deepEqual(portfolioEvents(single, null), []);
  const prompts = cockpitPrompts(single, data, null);
  assert.ok(prompts.length && prompts.length <= 5);
  assert.deepEqual(prompts.map(p => p.level), [...prompts.map(p => p.level)].sort((a, b) => ({ breach: 0, warning: 1, gap: 2, note: 3 })[a] - ({ breach: 0, warning: 1, gap: 2, note: 3 })[b]));
  for (const prompt of prompts) assert.ok(prompt.evidence.length, `${prompt.id} has a source`);
});

test('policy comparisons require retained SAA classifications, not country names',()=>{
  const holdings=[
    {...single.holdings[0],id:'equity',instrumentType:'Shares',weight:.2,country:'Switzerland',sector:'Health Care',saaRegion:'Equities Switzerland',saaIndustry:'Health Care',fundHoldings:undefined,fundBreakdown:undefined},
    {...single.holdings[0],id:'bond',instrumentType:'Bonds',weight:.3,country:'Switzerland',sector:'Financials',saaRegion:'Others',saaIndustry:undefined,fundHoldings:undefined,fundBreakdown:undefined},
  ];
  const analysis={...single,holdings,violations:[],notes:[]};
  const dataset={...data,reference:{...data.reference,StrategicAssetAllocations:[{Id:single.portfolios[0].StrategicAssetAllocationId,Mappings:[{Dimension:'CountryGroup',Category:'Equities Switzerland',TargetPercentage:.4},{Dimension:'Industry',Category:'Health Care',TargetPercentage:.3}]}]}};
  const country=breakdownRows(analysis,dataset,'country')[0];
  assert.equal(country.weight,.5);
  assert.equal(country.target,null,'a Swiss bond cannot be compared with an equity-country target');
  const health=breakdownRows(analysis,dataset,'industry').find(row=>row.name==='Health Care')!;
  assert.equal(health.target,null,'the denominator of a mixed-asset sector policy is unproven');
  assert.ok(!cockpitPrompts(analysis,dataset).some(p=>p.id.startsWith('drift:')));
  const missing={...analysis,holdings:holdings.map(h=>({...h,saaRegion:undefined,saaIndustry:undefined}))};
  assert.ok(breakdownRows(missing,dataset,'industry').every(row=>row.target===null));
  assert.ok(!cockpitPrompts(missing,dataset).some(p=>p.id.startsWith('drift:')));
});

test('only reconciled direct-equity classifications support a computed policy comparison',()=>{
  const analysis={...single,violations:[],notes:[],holdings:[
    {...single.holdings[0],id:'health',instrumentType:'Shares',weight:.4,sector:'Health Care',saaIndustry:'Health Care',fundHoldings:undefined,fundBreakdown:undefined},
    {...single.holdings[0],id:'energy',instrumentType:'Shares',weight:.6,sector:'Energy',saaIndustry:'Energy',fundHoldings:undefined,fundBreakdown:undefined},
  ]};
  const dataset={...data,reference:{...data.reference,StrategicAssetAllocations:[{Id:single.portfolios[0].StrategicAssetAllocationId,Mappings:[{Dimension:'Industry',Category:'Health Care',TargetPercentage:.5},{Dimension:'Industry',Category:'Energy',TargetPercentage:.5}]}]}};
  assert.ok(breakdownRows(analysis,dataset,'industry').every(row=>row.target===.5));
  assert.ok(cockpitPrompts(analysis,dataset).some(p=>p.id.startsWith('drift:')&&p.evidence.some(e=>e.id.startsWith('policy:'))));
  const partial={...analysis,holdings:analysis.holdings.map(h=>({...h,weight:h.weight/2}))};
  assert.ok(!cockpitPrompts(partial,dataset).some(p=>p.id.startsWith('drift:')));
});

test('Joker fund product Others tags never create underlying-allocation trade suggestions',()=>{
  const joker=data.clients.find(c=>c.ClientId===4801)!;
  const analysis=analyze(data,joker,'52253');
  assert.ok(analysis.holdings.some(h=>h.instrumentType==='Investment fund'&&h.saaRegion==='Others'));
  const prompts=cockpitPrompts(analysis,data);
  assert.ok(!prompts.some(p=>p.id.startsWith('drift:')));
  assert.ok(prompts.some(p=>p.id.startsWith('rule:')),'recorded rule findings remain visible');
  for(const kind of ['industry','country'] as const)assert.ok(breakdownRows(analysis,data,kind).every(row=>row.target===null&&row.deviation===null));
});

test('cockpit event exposure reuses canonical relevance and never sums overlapping macro buckets',()=>{
  const targets=newsTargets(single).filter(t=>t.kind==='country'||t.kind==='industry').slice(0,3);
  assert.ok(targets.length>1);
  const context:MarketContext={items:[{id:'macro',kind:'news',title:'Market update for portfolio classifications',source:'Publisher',url:'https://example.com/news',publishedAt:'2026-09-19',retrievedAt:'2026-09-19',entityIds:targets.map(t=>t.id),provider:'RSS',relevance:''}],checked:1,requested:1,warnings:[],elapsedMs:0,fetchedAt:'2026-09-19',providers:[]};
  assert.equal(portfolioEvents(single,context)[0].weight,Math.max(...targets.map(t=>t.weight!)));
});
