import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChokepoints, parseDisasters, parseEarthquakes, parseQuote, parseWarnings, warningPoint } from './world-layers';

const now=Date.parse('2026-09-19T12:00:00Z');

test('public earthquake and disaster adapters preserve source dates and locations',()=>{
  const quake=parseEarthquakes({features:[{id:'abc',properties:{mag:4.8,place:'Near Zurich',time:now-60_000,url:'https://earthquake.usgs.gov/event/abc'},geometry:{coordinates:[8.5,47.3,10]}}]},now);
  assert.equal(quake.length,1);
  assert.deepEqual(quake[0].location,[8.5,47.3]);
  assert.equal(quake[0].layer,'disaster');
  const disaster=parseDisasters({events:[{id:'eonet-1',title:'Cyclone',categories:[{title:'Storm'}],geometry:[{type:'Point',date:new Date(now-120_000).toISOString(),coordinates:[70,12]}],sources:[{url:'https://example.com/cyclone'}]}]},now);
  assert.equal(disaster.length,1);
  assert.deepEqual(disaster[0].location,[70,12]);
  assert.equal(disaster[0].source,'NASA EONET');
});

test('maritime warnings require a recent issued date and use the first safe coordinate',()=>{
  assert.deepEqual(warningPoint('AREA 12-00N 045-00E'),[45,12]);
  assert.deepEqual(warningPoint('AREA 12-30N 045-15E'),[45.25,12.5]);
  const rows=parseWarnings({warnings:[
    {id:'fresh',title:'Exercise',issuedAt:new Date(now-3600_000).toISOString(),expiresAt:now+3600_000,text:'12-30N 045-15E keep clear',url:'https://example.com/warning'},
    {id:'old',issuedAt:new Date(now-31*86400000).toISOString(),text:'12N 045E'},
  ]},now);
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].location,[45.25,12.5]);
  assert.equal(rows[0].layer,'shipping');
});

test('chokepoint baseline is explicitly reference-only when live status is unavailable',()=>{
  const rows=parseChokepoints({upstreamUnavailable:true,chokepoints:[{id:'suez',name:'Suez Canal',lat:30.5,lon:32.3,affectedRoutes:['Asia–Europe']}],fetchedAt:new Date(now).toISOString()},now);
  assert.equal(rows.length,1);
  assert.equal(rows[0].status,'reference');
  assert.match(rows[0].detail,/unavailable/i);
});

test('market adapter keeps provider observation time and rejects incomplete quotes',()=>{
  const quote=parseQuote({chart:{result:[{meta:{symbol:'^VIX',regularMarketPrice:14.8,regularMarketChangePercent:-3.2,regularMarketTime:(now-30_000)/1000,currency:'USD'},indicators:{quote:[{close:[14,14.8]}]}}]}},'VIX',now);
  assert.equal(quote?.symbol,'^VIX');
  assert.equal(quote?.change,-3.2);
  assert.equal(quote?.sparkline.length,2);
  assert.equal(parseQuote({chart:{result:[{meta:{symbol:'^VIX',regularMarketPrice:null}}]}},'VIX',now),undefined);
});
