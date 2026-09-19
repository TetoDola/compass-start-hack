import test from 'node:test';
import assert from 'node:assert/strict';
import { worldViewItems, worldContext, mergeWorldContext } from './world';
import { enrichRelevance, mergeContextItems } from './research';
import { matchesNewsTarget } from './newsMatching';
import type { ContextItem, MarketContext, NewsTarget } from './briefing';

const now=Date.parse('2026-09-19T12:00:00Z');
const a:NewsTarget={id:'instrument:A',name:'Microsoft',weight:.1,via:'Direct position'};
const b:NewsTarget={id:'instrument:B',name:'Apple Inc.',weight:.04,via:'Equity fund'};
const story:ContextItem={id:'rss:1',kind:'news',title:'Microsoft and Apple Inc. report higher earnings',source:'Publisher',url:'https://news.google.com/rss/articles/example',publishedAt:'2026-09-18T10:00:00Z',retrievedAt:'2026-09-19T10:00:00Z',entityIds:[a.id],relevance:'Source company mention.',provider:'RSS'};
const context=(items:ContextItem[]):MarketContext=>({items,checked:1,requested:1,warnings:[],elapsedMs:0,fetchedAt:'2026-09-19T10:00:00Z',providers:['RSS']});

test('World combines syndicated duplicates without losing ownership links or adding the same weight twice',()=>{
  const base=context([story]);
  const world=context([{...story,id:'world:2',url:'https://publisher.example/earnings',entityIds:[a.id,b.id],provider:'World Monitor'}]);
  const merged=mergeWorldContext(base,world,[a,b]);
  assert.equal(merged.items.length,1);
  assert.equal(merged.items[0].id,story.id);
  assert.equal(merged.items[0].url,'https://publisher.example/earnings');
  assert.deepEqual(merged.items[0].entityIds,[a.id,b.id]);
  assert.ok(Math.abs(merged.items[0].exposureWeight!-.14)<1e-10);
  const view=worldViewItems({...merged,world:{state:'complete',message:'Fixture',retrievedAt:base.fetchedAt,articles:1,matched:1,globalItems:world.items}},[a,b],30,now);
  assert.equal(view.length,1);assert.equal(view[0].exposureWeight,merged.items[0].exposureWeight);
});

test('client/scope changes remove old ownership and recompute current exposure',()=>{
  const previous=enrichRelevance(context([{...story,entityIds:[a.id,b.id]}]),[a,b]);
  const other=worldViewItems(previous,[{...b,weight:.025}],30,now);
  assert.deepEqual(other[0].entityIds,[b.id]);
  assert.equal(other[0].exposureWeight,.025);
  assert.ok(!other[0].relevance.includes('10.00%'));
  const unrelated=worldViewItems(previous,[],30,now);
  assert.deepEqual(unrelated[0].entityIds,[]);
  assert.equal(unrelated[0].matchKind,undefined);
  assert.equal(unrelated[0].exposureWeight,null);
});

test('sensor observations never become client company matches and filtering honors the selected date window',()=>{
  const digest={articles:[],signals:[{id:'quake:1',title:'Microsoft earthquake response',source:'USGS',url:'https://example.com/quake',publishedAt:story.publishedAt,tickers:[],layer:'disaster' as const}],state:'complete' as const,message:'Fixture',retrievedAt:story.retrievedAt};
  const world=worldContext(digest,[a],30,now);
  assert.equal(world.items.length,0);
  assert.equal(world.world?.globalItems?.length,1);
  assert.equal(worldViewItems(world,[a],1,now).length,0);
});

test('unknown or impossible exposure totals remain unknown',()=>{
  const item={...story,entityIds:[a.id,b.id]};
  assert.equal(enrichRelevance(context([item]),[a,{...b,weight:null}]).items[0].exposureWeight,null);
  assert.equal(enrichRelevance(context([item]),[{...a,weight:.8},{...b,weight:.7}]).items[0].exposureWeight,null);
});

test('distinct sensor observations sharing a source map URL remain distinct',()=>{
  const first={...story,id:'fire:1',layer:'disaster' as const,entityIds:[],url:'https://example.com/map',title:'Thermal detection'};
  const second={...first,id:'fire:2',publishedAt:'2026-09-18T11:00:00Z'};
  assert.deepEqual(mergeContextItems([first,second,first]).map(item=>item.id),['fire:1','fire:2']);
});

test('publisher suffixes do not duplicate the same headline across feeds',()=>{
  const duplicate={...story,id:'world:publisher',title:`${story.title} - AP News`,source:'AP News',url:'https://apnews.com/article/example',entityIds:[b.id]};
  const merged=mergeContextItems([story,duplicate]);
  assert.equal(merged.length,1);assert.deepEqual(merged[0].entityIds,[a.id,b.id]);
  assert.equal(mergeContextItems([story,{...duplicate,title:`${story.title} - another development`}]).length,2);
});

test('only same-instrument published aliases extend name matching',()=>{
  const target={...a,name:'International Business Machines Corp IBM',aliases:['IBM']};
  assert.equal(matchesNewsTarget({title:'IBM reports higher earnings'},target),true);
  assert.equal(matchesNewsTarget({title:'IBM reports higher earnings'},a),false);
});
