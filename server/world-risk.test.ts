import test from 'node:test';
import assert from 'node:assert/strict';
import { createCiiResolver, parseCiiScores } from './world-risk';

const now=Date.parse('2026-09-19T12:00:00Z');
const row={region:'CH',combinedScore:42,dynamicScore:2,trend:'TREND_DIRECTION_RISING',components:{ciiContribution:12,geoConvergence:4,militaryActivity:3,newsActivity:8},computedAt:now-60000,methodologyVersion:'v8'};

test('CII parser keeps dated country scores and signed 24h movement',()=>{
  const result=parseCiiScores({ciiScores:[row]},now);
  assert.equal(result.state,'partial');
  assert.deepEqual(result.scores[0],{code:'CH',score:42,change24h:2,trend:'rising',components:{unrest:12,conflict:4,security:3,information:8},computedAt:new Date(now-60000).toISOString(),methodologyVersion:'v8'});
  assert.equal(result.retrievedAt,new Date(now).toISOString());
});

test('zero dynamic inputs are disclosed and malformed or future scores are excluded',()=>{
  const result=parseCiiScores({ciiScores:[{...row,components:{ciiContribution:0,geoConvergence:0,militaryActivity:0,newsActivity:0},dynamicScore:0},{...row,region:'US',computedAt:now+3600000},{...row,region:'DE',combinedScore:Infinity}]},now);
  assert.equal(result.state,'partial');
  assert.equal(result.scores.length,1);
  assert.match(result.message,/No dynamic CII components/);
  assert.equal(parseCiiScores({ciiScores:[{...row,computedAt:now-3600000}]},now).state,'stale');
  assert.equal(parseCiiScores({ciiScores:[]},now).state,'unavailable');
});

test('CII resolver uses server credentials, shares cache and shows failed refresh as stale',async()=>{
  let calls=0;
  const resolver=createCiiResolver({WORLDMONITOR_BASE_URL:'http://localhost:6901',WORLDMONITOR_API_KEY:'wm_test'},async(input,init)=>{
    calls++;
    assert.equal(String(input),'http://localhost:6901/api/intelligence/v1/get-risk-scores');
    assert.equal(new Headers(init?.headers).get('X-WorldMonitor-Key'),'wm_test');
    if(calls===2)throw new Error('offline');
    return Response.json({ciiScores:[{...row,computedAt:Date.now()-60000}]});
  });
  const [a,b]=await Promise.all([resolver(),resolver()]);
  assert.equal(calls,1);
  assert.equal(a,b);
  await resolver();assert.equal(calls,1);
  const fallback=await resolver(true);
  assert.equal(calls,2);
  assert.equal(fallback.state,'stale');
  assert.equal(fallback.scores.length,1);
  assert.equal((await createCiiResolver({})()).state,'unconfigured');
});
