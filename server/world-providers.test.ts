import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKeyedWorldProviders, parseAis, parseEia, parseFirms } from './world-providers';
import { loadWorldLayers } from './world-layers';
import { createWorldResolver } from './world-context';
import { matchesWorldArticle } from '../src/lib/world';

const now = Date.parse('2026-09-19T12:00:00Z');
const header = 'latitude,longitude,acq_date,acq_time,confidence,frp';
const csv = `${header}\n47,8,2026-09-19,003,n,2\n48,9,2026-09-19,1100,h,3`;
const price = { series: 'RWTC', period: '2026-09-18', value: '100', units: '$/BBL' };
const vessel = { mmsi: '123456789', name: 'Example tanker', lon: 8, lat: 47, timestamp: now - 60000 };

test('FIRMS retains acquisition times and rejects invalid, future, low-confidence and duplicate detections', () => {
  const rows = parseFirms(`${csv}\n47,8,2026-09-19,003,n,2\n47,8,2026-09-19,1300,h,2\n47,8,2026-09-19,0900,l,2\n,8,2026-09-19,0900,h,2\n47,8,2026-09-19,2500,h,2\n47,8,2026-02-30,0900,h,2`, now);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].publishedAt, '2026-09-19T00:03:00.000Z');
  assert.deepEqual(rows[0].location, [9, 48]);
  assert.match(rows[0].summary!, /does not establish damage/);
  assert.throws(() => parseFirms('Invalid MAP_KEY', now));
  assert.deepEqual(parseFirms(header, now), []);
});

test('EIA parses numeric strings, daily units and previous observations without fabricating missing values', () => {
  const rows = parseEia({ response: { data: [{ ...price, period: '2026-09-17', value: '80' }, price, { ...price, period: '2026-09-19', value: '' }, { ...price, period: '2026-09-20', value: '999' }, { ...price, series: 'RBRTE', value: '105', units: 'Dollars per Barrel' }] } }, now);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].price, 100);
  assert.equal(rows[0].change, 25);
  assert.equal(rows[0].asOf, '2026-09-18T00:00:00.000Z');
  assert.equal(rows[1].change, null);
  assert.deepEqual(parseEia({ response: { data: [{ ...price, units: 'cents/gallon' }, { ...price, value: null }] } }, now), []);
});

test('AIS uses report reception time and discards old positions even when the snapshot is fresh', () => {
  const rows = parseAis({ dataAvailable: true, snapshot: { snapshotAt: now, tankerReports: [vessel, vessel, { ...vessel, mmsi: '234567890', timestamp: now - 31 * 60000 }, { ...vessel, mmsi: '345678901', lat: 91 }] } }, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].publishedAt, new Date(vessel.timestamp).toISOString());
  assert.match(rows[0].summary!, /No cargo, disruption, ownership or portfolio dependency/);
  assert.deepEqual(parseAis({ dataAvailable: false, snapshot: { tankerReports: [vessel] } }, now), []);
});

test('provider failures are isolated, credentials only go to the correct host, and output never leaks keys', async () => {
  const config = { EIA_API_KEY: 'test-eia-secret', NASA_FIRMS_API_KEY: 'test-firms-secret', AISSTREAM_API_KEY: 'test-ais-secret', WORLDMONITOR_BASE_URL: 'http://localhost:6901', WORLDMONITOR_API_KEY: 'test-local-secret' };
  const result = await loadKeyedWorldProviders(config, async (input, init) => {
    const url = new URL(String(input));
    const key = new Headers(init?.headers).get('X-WorldMonitor-Key');
    if (url.hostname === 'api.eia.gov') { assert.equal(key, null); assert.equal(url.searchParams.get('api_key'), config.EIA_API_KEY); return Response.json({ response: { data: [price] } }); }
    if (url.hostname === 'firms.modaps.eosdis.nasa.gov') { assert.equal(key, null); assert.ok(url.pathname.includes(config.NASA_FIRMS_API_KEY)); throw new Error(`Sensitive request URL: ${url}`); }
    assert.equal(url.hostname, 'localhost'); assert.equal(key, config.WORLDMONITOR_API_KEY); assert.equal(url.searchParams.get('include_tankers'), 'true');
    return Response.json({ dataAvailable: true, snapshot: { status: { connected: true }, tankerReports: [{ ...vessel, timestamp: Date.now() - 1000 }] } });
  });
  assert.equal(result.quotes.length, 1);
  assert.equal(result.signals.length, 1);
  assert.equal(result.layers.find(l => l.id === 'firms')?.state, 'unavailable');
  for (const key of [config.EIA_API_KEY, config.NASA_FIRMS_API_KEY, config.AISSTREAM_API_KEY, config.WORLDMONITOR_API_KEY]) assert.ok(!JSON.stringify(result).includes(key));
});

test('unconfigured sources make no requests and expose their configuration state', async () => {
  const result = await loadKeyedWorldProviders({}, async () => { throw new Error('Unexpected request'); });
  assert.equal(result.layers.length, 3);
  assert.ok(result.layers.every(l => l.state === 'unavailable' && /not configured/.test(l.message)));
});

test('concurrent market and EIA results survive either completion order', async () => {
  for (const slowEia of [false, true]) {
    const result = await loadWorldLayers({ EIA_API_KEY: 'test-key' }, async input => {
      if (String(input).includes('api.eia.gov')) { if (slowEia) await new Promise(r => setTimeout(r, 750)); return Response.json({ response: { data: [price] } }); }
      if (String(input).includes('finance.yahoo.com')) return Response.json({ chart: { result: [{ meta: { symbol: String(input), regularMarketPrice: 123, regularMarketTime: Math.floor((Date.now() - 1000) / 1000) } }] } });
      return Response.json({});
    });
    assert.equal(result.quotes?.length, 6);
    assert.equal(result.layers?.find(l => l.id === 'markets')?.count, 5);
  }
});

test('FIRMS works without World Monitor and caps the sample with visible partial coverage', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const detections = Array.from({ length: 301 }, (_, i) => `47,${i / 100},${today},0000,h,1`).join('\n');
  let calls = 0;
  const resolver = createWorldResolver({ NASA_FIRMS_API_KEY: 'test-key' }, async input => {
    if (String(input).includes('firms.modaps')) { calls++; return new Response(`${header}\n${detections}`); }
    return Response.json({});
  });
  const [a, b] = await Promise.all([resolver(), resolver()]);
  assert.equal(a, b); assert.equal(calls, 1);
  assert.equal(a.state, 'unconfigured');
  assert.equal(a.signals?.length, 300);
  assert.equal(a.layers?.find(l => l.id === 'firms')?.state, 'partial');
  assert.match(a.layers?.find(l => l.id === 'firms')?.message || '', /300 of 301/);
});

// A vessel can share a name with a held company without belonging to it.
test('AIS vessel names never establish a portfolio-company connection', () => {
  const [article] = parseAis({ dataAvailable: true, snapshot: { tankerReports: [{ ...vessel, name: 'Microsoft Corporation' }] } }, now);
  assert.equal(matchesWorldArticle(article, { id: 'company', name: 'Microsoft Corporation', kind: 'company', weight: 0.1, via: 'Direct' }), false);
});
