import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './analysis';
import { portfolioExposures, periodPerformance, portfolioAttention, rangeStart, violationMeasurement } from './portfolio';
import { advisorFacts, routeQuestion, answerFromIds } from './advisor';
import { materialEvent } from './events';
import { buildNetwork } from './network';
import { newsTargets, defaultSelection, briefingCandidates } from './briefing';
import type { Dataset } from './types';
const data: Dataset=JSON.parse(readFileSync('public/data/case-data.json','utf8'));
const a=analyze(data,data.clients.find(c=>c.ClientId===35050)!);

test('monthly history never invents daily or weekly returns; monthly and annual endpoints reconcile',()=>{
  assert.equal(periodPerformance(a,'1D').available,false);assert.equal(periodPerformance(a,'7D').change,null);
  for(const range of ['1M','1Y'] as const){const p=periodPerformance(a,range);assert.ok(p.available);assert.equal(p.change,p.end!.value/p.start!.value-1);assert.equal(p.points[0].date,p.startDate);}
  assert.equal(rangeStart('2026-03-31','1M'),'2026-02-28');assert.equal(rangeStart('2024-02-29','1Y'),'2023-02-28');
});
test('fund industry classification is counted once and country view does not use fund domicile',()=>{
  const industry=portfolioExposures(a,'industry');const company=portfolioExposures(a,'company');const countries=portfolioExposures(a,'country');
  const apple=company.find(c=>c.isin==='US0378331005')!;
  const expected=a.holdings.reduce((n,h)=>n+(h.isin==='US0378331005'?h.weight:0)+h.weight*(h.fundHoldings?.holdings.find(c=>c.isin==='US0378331005')?.weight || 0),0);
  assert.ok(Math.abs(apple.weight-expected)<1e-12);
  assert.ok(industry.reduce((n,r)=>n+r.weight,0)<=a.holdings.reduce((n,h)=>n+h.weight,0)+1e-6);
  assert.ok(!countries.some(c=>c.name==='Ireland'));assert.ok(countries.some(c=>c.name==='Switzerland'));
  assert.ok(!countries.some(c=>c.name==='North America'));assert.ok(portfolioExposures(a,'region').some(c=>c.name==='North America'));
});
test('every scope has finite non-duplicated exposures; ambiguous scopes withhold all weights',()=>{
  for(const c of data.clients) for(const scope of ['all',...c.Portfolios.map((p:any)=>String(p.PortfolioId))]) {
    const result=analyze(data,c,scope);
    for(const kind of ['industry','country','company','region'] as const){const rows=portfolioExposures(result,kind);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);assert.ok(rows.every(r=>Number.isFinite(r.weight)&&r.weight>0));if(result.scopeAmbiguous){assert.equal(rows.length,0);assert.equal(portfolioAttention(result)[0].id,'scope');}}
  }
});
test('attention groups actual rule names and preserves supplied thresholds and evidence',()=>{
  const items=portfolioAttention(a);assert.equal(items[0].level,'critical');
  const usd=items.find(i=>i.title==='Currency concentration')!;assert.ok(usd);assert.match(usd.metric!,/75.3%.*35.5%/);
  assert.equal(violationMeasurement({ViolationPath:'not-json'}),'');assert.ok(usd.evidence.every(e=>e.location.includes('SuitabilityViolations')));
});
test('supplied profile limits are compared even when the export records no violation',()=>{
  const client=(id:number)=>analyze(data,data.clients.find(c=>c.ClientId===id)!);
  const quiet=client(31909);assert.equal(quiet.violations.length,0);
  const vol=portfolioAttention(quiet).find(i=>i.id.startsWith('profile-volatility:'))!;
  assert.equal(vol.level,'critical');assert.match(vol.title,/60\.6% above the profile ceiling/);assert.match(vol.metric!,/15\.0% ceiling/);
  assert.ok(vol.evidence.some(e=>e.location.includes('RiskProfiles[Id=18]')));
  // Hard limits lead the agenda, so they reach the brief's health and action candidates.
  const candidates=briefingCandidates(quiet);assert.match(candidates.find(c=>c.id==='agenda:health')!.text,/profile ceiling/);
  const conservative=portfolioAttention(client(62909));
  assert.match(conservative.find(i=>i.id==='profile-equity')!.title,/above the 45\.0% profile ceiling/);
  assert.match(conservative.find(i=>i.id==='profile-product-risk')!.detail,/class 6/);
  assert.match(portfolioAttention(client(49948)).find(i=>i.id.startsWith('profile-strategy:'))!.title,/sits above the recorded risk profile/);
  const esg=portfolioAttention(client(40610)).find(i=>i.id==='profile-sustainability')!;
  assert.equal(esg.level,'review');assert.match(esg.metric!,/minimum 5\.71 per position/);
  // A client whose supplied figures sit inside every limit gains no invented finding.
  assert.equal(portfolioAttention(client(911)).some(i=>i.id.startsWith('profile-')),false);
});
test('recorded volatility findings keep their direction and rule name',()=>{
  const below=portfolioAttention(analyze(data,data.clients.find(c=>c.ClientId===4801)!)).find(i=>i.title==='Risk level and volatility')!;
  assert.match(below.metric!,/Volatility range undershot/);
  assert.match(below.action,/below the agreed range/);assert.doesNotMatch(below.action,/lower-risk/);
  const mixed=portfolioAttention(analyze(data,data.clients.find(c=>c.ClientId===911)!)).find(i=>i.title==='Risk level and volatility')!;
  assert.match(mixed.action,/opposite directions/);
});
test('distress triage prioritizes affirmative reports without labeling denials, questions or recovery as bankruptcy',()=>{
  for(const title of ['Example files for bankruptcy','Example enters administration','Example defaults on debt']) assert.equal(materialEvent(title)?.severity,'critical');
  for(const title of ['Example denies bankruptcy rumours','Example avoids bankruptcy','Could Example file for bankruptcy?','Example emerges from bankruptcy','Example may file for bankruptcy','Example dividend grows']) assert.equal(materialEvent(title),undefined,title);
});
test('company, industry and geography news targets connect to graph and a small distress event survives positive totals',()=>{
  const targets=newsTargets(a);assert.ok(targets.some(t=>t.kind==='industry'));assert.ok(targets.some(t=>t.kind==='country'));
  const company=targets.find(t=>!t.kind)!;
  const context={items:[{id:'news:test',kind:'news' as const,title:`${company.name} files for bankruptcy`,source:'Test fixture',url:'https://example.com/report',publishedAt:new Date().toISOString(),retrievedAt:new Date().toISOString(),entityIds:[company.id],relevance:'Test fixture only',provider:'fixture'}],checked:1,requested:targets.length,warnings:[],elapsedMs:0,fetchedAt:new Date().toISOString(),providers:['fixture']};
  const network=buildNetwork(a,new Set(a.holdings.filter(h=>h.fundHoldings).map(h=>`instrument:${h.isin}`)),context);
  assert.equal(network.nodes.find(n=>n.id===company.id)?.materialEvent,true);assert.ok(network.nodes.some(n=>n.type==='country'));assert.ok(!network.nodes.some(n=>n.type==='note'));
  const positive={...a,history:[{date:'2026-06-01',value:100},{date:'2026-07-01',value:110}]};
  const events=advisorFacts(positive,context).find(f=>f.id==='events')!;assert.match(events.text.join(' '),/bankruptcy/);assert.equal(events.articles?.length,1);
});
test('grounded conversation supports compound exposure questions, period follow-ups, and unsupported requests',()=>{
  const facts=advisorFacts(a);
  assert.deepEqual(routeQuestion('Exposure by country and industry',facts),['exposure:country','exposure:industry']);
  assert.ok(routeQuestion('How has it performed over 1 year?',facts).includes('performance:1Y'));
  assert.ok(routeQuestion('What about 7 days?',facts,['How has it performed?']).includes('performance:7D'));
  assert.ok(routeQuestion('What is wrong with this portfolio?',facts).includes('attention'));
  assert.ok(routeQuestion('Tell me about Apple',facts).some(id=>id==='entity:instrument:US0378331005'));
  assert.equal(answerFromIds(routeQuestion('Write a poem about cats',facts),facts).blocks[0].id,'unavailable');
  assert.equal(defaultSelection(briefingCandidates(a)).development[0],'fact:value-development');
});
