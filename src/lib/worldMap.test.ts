import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLocatedItems } from '../WorldMap';
import type { ContextItem } from './briefing';

const item:ContextItem={id:'news:1',kind:'news',title:'Bank of China reports earnings',source:'Publisher',url:'https://example.com/story',publishedAt:'2026-09-19T09:00:00Z',retrievedAt:'2026-09-19T10:00:00Z',entityIds:[],relevance:'Global context',provider:'RSS'};

test('country names in company headlines never fabricate map locations',()=>{
  assert.equal(sourceLocatedItems([item])[0].geo,undefined);
  const inferred={...item,geo:{coordinates:[105,35] as [number,number],label:'China',basis:'country-mention' as const}};
  assert.equal(sourceLocatedItems([inferred])[0].geo,undefined);
  assert.deepEqual(inferred.geo.coordinates,[105,35]);
});

test('map keeps source location provenance but excludes invalid coordinates',()=>{
  const located={...item,geo:{coordinates:[0,0] as [number,number],label:'Source coordinates',basis:'event-location' as const}};
  assert.equal(sourceLocatedItems([located])[0],located);
  for(const coordinates of [[181,0],[0,-91],[Number.NaN,1],[2,Infinity]] as [number,number][]){
    const result=sourceLocatedItems([{...located,geo:{...located.geo,coordinates}}])[0];
    assert.equal(result.geo,undefined);
    assert.equal(result.id,item.id);
  }
  const article={...located,geo:{...located.geo,basis:'article-location' as const}};
  assert.equal(sourceLocatedItems([article])[0].geo?.basis,'article-location');
});
