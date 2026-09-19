import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldResolver, parseWorldDigest } from './world-context';
const now=Date.parse('2026-09-19T12:00:00Z');
const row={title:'Company update',source:'Publisher',link:'https://example.com/news',publishedAt:now-1000,tickers:['NVDA'],location:{latitude:47,longitude:8}};
test('world adapter requires safe source links and dated articles, preserves publication and retrieval separately',()=>{
 const result=parseWorldDigest({categories:{markets:{items:[row,row,{...row,link:'javascript:alert(1)'},{...row,link:'https://example.com/undated',publishedAt:0},{...row,link:'https://example.com/future',publishedAt:now+1}]}},coverage:{state:'partial'},generatedAt:'2026-09-19T11:59:00Z'},now);
 assert.equal(result.articles.length,1);assert.equal(result.state,'partial');assert.deepEqual(result.articles[0].location,[8,47]);assert.notEqual(result.articles[0].publishedAt,result.retrievedAt);
});
test('unconfigured, malformed and unreachable services fail visibly and never supply fake news',async()=>{
 assert.equal((await createWorldResolver({})()).state,'unconfigured');
 assert.throws(()=>parseWorldDigest({error:'failed'},now));
 const resolver=createWorldResolver({WORLDMONITOR_BASE_URL:'http://localhost:6901'},async()=>{throw new Error('offline');});
 const result=await resolver();assert.equal(result.state,'unavailable');assert.deepEqual(result.articles,[]);
});
test('digest requests are shared, cached and carry only server-side credentials',async()=>{
 let calls=0;
 const resolver=createWorldResolver({WORLDMONITOR_BASE_URL:'http://localhost:6901',WORLDMONITOR_API_KEY:'wm_test'},async(input,init)=>{
 if(!String(input).includes('list-feed-digest'))return Response.json({});
 calls++;assert.equal(String(input),'http://localhost:6901/api/news/v1/list-feed-digest?variant=full&lang=en');assert.equal(new Headers(init?.headers).get('X-WorldMonitor-Key'),'wm_test');assert.equal(init?.body,undefined);
 return Response.json({categories:{news:{items:[{...row,publishedAt:Date.now()-1000}]}},coverage:{state:'complete'}});
 });
 const [a,b]=await Promise.all([resolver(),resolver()]);assert.equal(calls,1);assert.equal(a,b);await resolver();assert.equal(calls,1);
 await resolver(true);assert.equal(calls,2,'an explicit refresh bypasses the Compass cache');
});
