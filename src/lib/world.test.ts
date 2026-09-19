import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesWorldArticle, worldContext, mergeWorldContext, countryKey, scenarioEffect, type WorldArticle } from './world';
import type { NewsTarget } from './briefing';
const now=Date.parse('2026-09-19T12:00:00Z');
const article:WorldArticle={id:'world:1',title:'Swiss banking update',source:'Publisher',url:'https://example.com/1',publishedAt:'2026-09-19T09:00:00Z',tickers:[]};
const target:NewsTarget={kind:'country',id:'country:Switzerland',name:'Switzerland',weight:.25,via:'Allocation'};
test('world news matches explicit country aliases without converting broad regions to countries',()=>{
 assert.equal(matchesWorldArticle(article,target),true);
 assert.equal(matchesWorldArticle({...article,title:'Drumline performs in Switzerland'},target),false);
 assert.equal(matchesWorldArticle({...article,title:'North America market update'},{...target,name:'United States'}),false);
 assert.equal(matchesWorldArticle({...article,title:'Tell us about your portfolio'},{...target,name:'United States'}),false);
 assert.equal(countryKey('United States of America'),countryKey('United States'));
});
test('company matching uses a legal name or verified ticker and not substrings',()=>{
 const t:NewsTarget={id:'instrument:1',name:'Nvidia Corp.',symbol:'NVDA',via:'Fund',weight:.03};
 assert.equal(matchesWorldArticle({...article,title:'Nvidia reports earnings'},t),true);
 assert.equal(matchesWorldArticle({...article,title:'Nvidiathon launches'},t),false);
 assert.equal(matchesWorldArticle({...article,tickers:['NVDA']},t),true);
 assert.equal(matchesWorldArticle({...article,title:'Detentions in Equatorial Guinea'},{...t,name:'Equatorial SA',symbol:undefined}),false);
 assert.equal(matchesWorldArticle({...article,title:'Equatorial shares rally after earnings'},{...t,name:'Equatorial SA',symbol:undefined}),true);
});
test('world filter excludes future, undated and out-of-window articles; null weights stay unknown',()=>{
 const context=worldContext({articles:[article,{...article,url:'https://example.com/old',publishedAt:'2026-09-01'}, {...article,url:'https://example.com/future',publishedAt:'2027-01-01'}, {...article,url:'https://example.com/bad',publishedAt:''}],state:'partial',retrievedAt:new Date(now).toISOString(),message:'Partial'},[{...target,weight:null}],1,now);
 assert.equal(context.items.length,1);assert.equal(context.items[0].exposureWeight,null);assert.equal(context.world?.matched,1);
});
test('merging does not duplicate headlines, replace existing IDs or sum overlapping weights',()=>{
 const context=worldContext({articles:[article],state:'complete',retrievedAt:new Date(now).toISOString(),message:'Connected'},[target],7,now);
 const base={...context,items:context.items.map(i=>({...i,id:'existing',entityIds:['instrument:2']}))};
 const merged=mergeWorldContext(base,context,[target]);
 assert.equal(merged.items.length,1);assert.equal(merged.items[0].id,'existing');assert.deepEqual(merged.items[0].entityIds,[target.id]);assert.equal(merged.items[0].exposureWeight,.25);
});
test('hypothetical arithmetic never invents exposure or accepts invalid weights',()=>{assert.ok(Math.abs(scenarioEffect(.1,-.2)!+.02)<1e-10);assert.equal(scenarioEffect(null,-.2),null);assert.equal(scenarioEffect(2,-.2),null);});

test('a country event traces through the selected real portfolio to source holdings',async()=>{
 const {readFileSync}=await import('node:fs');
 const {analyze}=await import('./analysis');
 const {newsTargets,instrumentId,briefingCandidates}=await import('./briefing');
 const {buildNetwork,neighborhood}=await import('./network');
 const d=JSON.parse(readFileSync(new URL('../../public/data/case-data.json',import.meta.url),'utf8'));
 const a=analyze(d,d.clients.find((c:any)=>c.ClientId===4801),'52253');
 const context=worldContext({articles:[{...article,title:'Japan central bank raises interest rates'}],state:'complete',retrievedAt:new Date(now).toISOString(),message:'Connected'},newsTargets(a),7,now);
 assert.equal(context.items.length,1);
 const network=buildNetwork(a,new Set(a.holdings.map(h=>instrumentId(h.isin,h.id))),context);
 const trace=neighborhood(network,new Set([context.items[0].id]),2);
 assert.ok(trace.nodes.some(n=>n.type==='country'&&n.name==='Japan'));
 assert.ok(trace.nodes.some(n=>n.type==='fund'));
 assert.ok(trace.edges.some(e=>e.inferred&&e.target===context.items[0].id));
 assert.ok(briefingCandidates(a,context).some(c=>c.contextId===context.items[0].id));
 const overlap=analyze(d,d.clients.find((c:any)=>c.ClientRef==='CASE-038'));
 assert.ok(newsTargets(overlap).filter(t=>!t.kind||t.kind==='company').every(t=>t.weight===null));
});
