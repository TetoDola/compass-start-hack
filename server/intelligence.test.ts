import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFmpHoldings } from './providers';
import { parseNewsRss, researchSample, safeUrl, createContextResolver } from './market-context';
import { selectBrief } from './intelligence';
import { sections, type BriefCandidate } from '../src/lib/briefing';

test('FMP weights stay partial and require a matching fund and consistent dated update', () => {
  const rows = [{ symbol: 'SPY', asset: 'AAPL', name: 'Apple', isin: 'US0378331005', weightPercentage: 6.7, updatedAt: '2026-09-17' }];
  const snapshot = parseFmpHoldings(rows, 'US78462F1030', 'SPY'); assert.equal(snapshot.holdings[0].weight, .067); assert.equal(snapshot.asOf, '2026-09-17');
  assert.throws(() => parseFmpHoldings(rows, 'US78462F1030', 'OTHER'), /mismatched/);
  assert.throws(() => parseFmpHoldings([{ ...rows[0], updatedAt: undefined }], 'US78462F1030', 'SPY'), /date/);
  assert.throws(() => parseFmpHoldings([{ ...rows[0], weightPercentage: 120 }], 'US78462F1030', 'SPY'), /Invalid/);
});
test('RSS rejects stale, future, unsafe and unrelated headlines, retaining source dates', () => {
  const target = { id: 'instrument:US0378331005', name: 'Apple Inc.', isin: 'US0378331005', via: 'Direct position', weight: .1 };
  const item = (title: string, link: string, date: string) => `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate><source>Publisher</source></item>`;
  const date = new Date().toUTCString();
  const xml = `<rss><channel>${item('Apple earnings - Publisher', 'https://example.com/a', date)}${item('Apple old news', 'https://example.com/b', '2001-01-01')}${item('Unrelated company', 'https://example.com/c', date)}${item('Apple malicious', 'javascript:alert(1)', date)}${item('Apple tomorrow', 'https://example.com/d', '2099-01-01')}</channel></rss>`;
  const result = parseNewsRss(xml, target); assert.equal(result.length, 1); assert.equal(result[0].title, 'Apple earnings'); assert.deepEqual(result[0].entityIds, [target.id]); assert.match(result[0].relevance, /unverified/); assert.equal(safeUrl('javascript:alert(1)'), undefined);
  assert.equal(researchSample([], ['Utilities']).length, 0); assert.equal(researchSample([], ['Information Technology'])[0].sample, true);
});
test('cached public news rebinds to the requesting client and does not leak previous context', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<rss><channel><item><title>Apple earnings</title><link>https://example.com/a</link><pubDate>${new Date().toUTCString()}</pubDate><source>Publisher</source></item></channel></rss>`);
  try {
    const resolve = createContextResolver({});
    await resolve([{ id: 'client-one-holding', name: 'Apple', via: 'A fund', weight: .3 }], []);
    const next = await resolve([{ id: 'client-two-holding', name: 'Apple', via: 'Direct position', weight: .1 }], []);
    assert.deepEqual(next.items[0].entityIds, ['client-two-holding']); assert.match(next.items[0].relevance, /directly/); assert.ok(!JSON.stringify(next).includes('client-one'));
  } finally { globalThis.fetch = original; }
});
test('missing key uses a valid structured result without an API call', async () => {
  const candidates: BriefCandidate[] = sections.map(s => ({ id: s.id, section: s.id, text: 'Source-backed sentence', sourceIds: [] }));
  const result = await selectBrief(candidates, {}); assert.equal(result.mode, 'structured'); assert.match(result.message, /not configured/);
});
test('OpenBB receives an explicitly mapped ticker, normalizes results, and falls back on failure', async () => {
  const original = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = async input => { calls.push(String(input)); return new Response(JSON.stringify({ results: [{ title: 'Apple reports earnings', url: 'https://example.com/openbb', date: new Date().toISOString(), source: 'Provider' }] })); };
  try {
    const result = await createContextResolver({ OPENBB_BASE_URL: 'http://127.0.0.1:6900/api/v1', OPENBB_SYMBOLS: '{"US0378331005":"AAPL"}' })([{ id: 'apple', name: 'Apple', isin: 'US0378331005', via: 'Direct position', weight: .1 }], []);
    assert.match(calls[0], /api\/v1\/news\/company\?symbol=AAPL/); assert.equal(result.items[0].provider, 'OpenBB / yfinance');
    globalThis.fetch = async input => String(input).includes('6900') ? new Response('', { status: 503 }) : new Response(`<rss><channel><item><title>Apple earnings</title><link>https://example.com/rss</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
    const fallback = await createContextResolver({ OPENBB_BASE_URL: 'http://127.0.0.1:6900/api/v1', OPENBB_SYMBOLS: '{"US0378331005":"AAPL"}' })([{ id: 'apple', name: 'Apple', isin: 'US0378331005', via: 'Direct position', weight: .1 }], []);
    assert.equal(fallback.items[0].provider, 'Google News RSS'); assert.ok(fallback.warnings.some(w => w.includes('No OpenBB')));
  } finally { globalThis.fetch = original; }
});
test('AI output with an unsupported claim ID falls back to the valid structured brief', async () => {
  const original = globalThis.fetch;
  const candidates: BriefCandidate[] = sections.map(s => ({ id: s.id, section: s.id, text: 'Recorded fact', sourceIds: [] }));
  globalThis.fetch = async () => new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ development: ['invented trade'], health: ['health'], outlook: ['outlook'], actions: ['actions'] }) }] }] }));
  try { const result = await selectBrief(candidates, { OPENAI_API_KEY: 'test-only' }); assert.equal(result.mode, 'structured'); assert.deepEqual(result.selection.development, ['development']); assert.match(result.message, /validation/); } finally { globalThis.fetch = original; }
});
