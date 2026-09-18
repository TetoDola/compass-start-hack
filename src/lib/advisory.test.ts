import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './analysis';
import { aggregateProducts, allocationReview, lookThrough, mandate, referencePriceReview } from './advisory';
import { portfolioAttention, portfolioExposures } from './portfolio';
import { briefingCandidates, defaultSelection, newsTargets, validateSelection } from './briefing';
import { parseResearch, researchItems } from './research';
import { buildNetwork } from './network';
import type { Dataset } from './types';
const data:Dataset=JSON.parse(readFileSync('public/data/case-data.json','utf8'));
const client=(ref:string)=>analyze(data,data.clients.find(c=>c.ClientRef===ref)!);

test('pension review combines identical gold positions and surfaces old reference dates without claiming bad valuations',()=>{
  const a=client('CASE-005'),gold=aggregateProducts(a).find(p=>p.isin==='CH0352765397')!;
  assert.equal(gold.positions.length,2);assert.ok(Math.abs(gold.weight-.2046922050908581)<1e-8);assert.ok(Math.abs(gold.value!-98168.92687)<1e-4);
  assert.equal(mandate(a).pension,true);assert.match(mandate(a).cashLabel,/unverified/);
  const dates=referencePriceReview(a);assert.equal(dates.length,3);assert.ok(dates.every(r=>r.ageDays!>800));
  const review=portfolioAttention(a);assert.equal(review[0].id,'product-concentration');assert.match(review.find(r=>r.id==='price-freshness')!.detail,/does not prove/);
  assert.equal(lookThrough(gold.positions[0]).status,'not-applicable');
  const network=buildNetwork(a,new Set());assert.ok(network.nodes.find(n=>n.id===gold.id)?.description.includes('20.47%'));assert.equal(network.edges.filter(e=>e.target===gold.id&&e.labels.includes('holds directly')).length,2);
});
test('non-equity constituents never become operating-company exposure or company-news targets',()=>{
  const a=client('CASE-005');const h=a.holdings.find(h=>h.asset==='Real estate')!;
  h.fundHoldings={isin:h.isin!,name:'Property vehicle',asOf:'2026-09-01',retrievedAt:'2026-09-19',sourceName:'Fixture',sourceUrl:'https://example.com',coverage:'top-holdings',holdings:[{name:'Property fund unit',isin:'CH0000000001',weight:.5}]};
  assert.equal(lookThrough(h).status,'not-applicable');assert.ok(!portfolioExposures(a,'company').some(e=>e.isin==='CH0000000001'));assert.ok(!newsTargets(a).some(t=>t.isin==='CH0000000001'));
  const n=buildNetwork(a,new Set([`instrument:${h.isin}`]));assert.equal(n.nodes.find(n=>n.id==='instrument:CH0000000001')?.type,'instrument');
});
test('policy comparison reconciles taxonomy and rejects zero or contradictory policies; mandate stays visible',()=>{
  const a=client('CASE-012'),p=allocationReview(a)[0];assert.equal(p.valid,true);assert.ok(Math.abs(p.rows.find(r=>r.name==='Shares')!.actual-.99261)<1e-7);
  a.policyTargets=structuredClone(a.policyTargets);a.policyTargets![0].mappings.find(m=>m.Dimension==='AssetClass')!.MinPercentage=.9;assert.equal(allocationReview(a)[0].valid,false);
  const execution=client('CASE-028');assert.equal(mandate(execution).executionOnly,true);assert.equal(allocationReview(execution)[0].valid,false);
  const candidates=briefingCandidates(execution),selection=validateSelection(defaultSelection(candidates),candidates);assert.match(candidates.find(c=>c.id===selection.actions[0])!.text,/Execution-only/);
});
test('uploaded research requires dated provenance and exact supported exposure matches',()=>{
  const row={title:'Sourced technology view',source:'Test research',url:'https://example.com/view',publishedAt:'2026-09-01',summary:'A dated research statement, not a trade.',provenance:'public-research',topics:[{kind:'industry',value:'Information Technology'}]};
  const library=parseResearch(JSON.stringify([row]));const items=researchItems(library,newsTargets(client('CASE-012')));assert.equal(items.length,1);assert.equal(items[0].provenance,'public-research');assert.ok(!items[0].sample);
  assert.equal(researchItems(library,[{kind:'industry',id:'other',name:'Utilities',via:'test',weight:.5}]).length,0);
  for(const invalid of [{...row,url:'javascript:alert(1)'},{...row,publishedAt:'2026-02-30'},{...row,topics:[{kind:'company',value:'Apple'}]},{...row,provenance:'verified-by-compass'}])assert.throws(()=>parseResearch(JSON.stringify([invalid])));
});
