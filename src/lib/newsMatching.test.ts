import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { companyName, matchesNewsTarget, type MatchableNews } from './newsMatching';
import { matchesWorldArticle } from './world';
import { parseNewsRss } from '../../server/market-context';
import { analyze } from './analysis';
import { newsTargets, type NewsTarget } from './briefing';
import type { Dataset } from './types';

const company = (name: string, extra: Partial<NewsTarget> = {}): NewsTarget => ({
  id: `company:${name}`, name, via: 'Direct position', weight: .1, ...extra,
});

test('issuer cleanup preserves ordinary final letters and meaningful multiword names', () => {
  for (const [input, expected] of [
    ['Apple', 'Apple'], ['AbbVie', 'AbbVie'], ['Union Pacific', 'Union Pacific'],
    ['Nestlé SA', 'Nestlé'], ['ABB Ltd', 'ABB'], ['SAP SE', 'SAP'],
    ['Equatorial SA', 'Equatorial'], ['Siemens AG', 'Siemens'],
    ['Alphabet, Inc. A', 'Alphabet'], ['Alphabet · Class C', 'Alphabet'],
    ['China Yangtze Power Co., Ltd.', 'China Yangtze Power'],
    ['Caterpillar Inc /US', 'Caterpillar'],
  ]) assert.equal(companyName(input), expected, input);
});

const examples: Array<{ name: string; title: string; expected: boolean }> = [
  { name: 'Equatorial SA', title: 'Equatorial Guinea oil exports fall', expected: false },
  { name: 'Equatorial SA', title: 'Equatorial shares rally after earnings', expected: true },
  { name: 'Union Pacific Corp', title: 'Pacific earthquake disrupts shipping', expected: false },
  { name: 'Union Pacific Corp', title: 'Union Pacific earnings beat estimates', expected: true },
  { name: 'China Yangtze Power Co., Ltd.', title: 'China power demand rises', expected: false },
  { name: 'China Yangtze Power Co., Ltd.', title: 'China Yangtze Power reports higher revenue', expected: true },
  { name: 'ABB Ltd', title: 'ABB earnings rise on manufacturing demand', expected: true },
  { name: 'SAP SE', title: 'SAP raises revenue guidance', expected: true },
  { name: 'SAP SE', title: 'Tree sap stocks help farmers after drought', expected: false },
  { name: 'Nestlé SA', title: 'Nestle raises dividend', expected: true },
  { name: 'Alphabet · Class C', title: 'Alphabet revenue exceeds forecasts', expected: true },
  { name: 'NVIDIA Corp.', title: 'Nvidiathon raises money for charity', expected: false },
  { name: 'Shell Plc', title: 'Shell companies face new banking rules', expected: false },
  { name: 'Shell Plc', title: 'Shell raises LNG production guidance', expected: true },
  { name: 'Apple Inc', title: 'Apple harvest boosts farmers profits', expected: false },
  { name: 'Apple Inc', title: 'Apple raises iPhone production guidance', expected: true },
  { name: 'Visa, Inc.', title: 'Visa rules for business investors change', expected: false },
  { name: 'Visa, Inc.', title: 'Visa reports record revenue', expected: true },
  { name: 'Siemens AG', title: 'Siemens Energy raises profit guidance', expected: false },
  { name: 'Siemens AG', title: 'Siemens Healthineers reports earnings', expected: false },
  { name: 'Siemens AG', title: 'Siemens raises revenue guidance', expected: true },
  { name: 'Siemens Energy AG', title: 'Siemens raises revenue guidance', expected: false },
  { name: 'Siemens Energy AG', title: 'Siemens Energy raises profit guidance', expected: true },
  { name: 'Merck & Co., Inc.', title: 'Merck KGaA reports earnings growth', expected: false },
  { name: 'Merck & Co., Inc.', title: 'Merck & Co. raises revenue guidance', expected: true },
];

for (const example of examples) test(`issuer relevance: ${example.name} / ${example.title}`, () => {
  const target = company(example.name);
  assert.equal(matchesNewsTarget({ title: example.title }, target), example.expected, 'shared matcher');
  assert.equal(matchesWorldArticle({
    id: 'example', title: example.title, source: 'Fixture', url: 'https://example.com/news',
    publishedAt: new Date().toISOString(), tickers: [],
  }, target), example.expected, 'World Monitor path');
  const escaped = example.title.replaceAll('&', '&amp;');
  const rss = `<rss><channel><item><title>${escaped}</title><link>https://example.com/news</link><pubDate>${new Date().toUTCString()}</pubDate><source>Fixture</source></item></channel></rss>`;
  assert.equal(parseNewsRss(rss, target).length > 0, example.expected, 'per-client RSS path');
});

test('country relevance requires headline evidence and recognizes canonical aliases', () => {
  const cases: Array<[NewsTarget, MatchableNews, boolean]> = [
    [company('Switzerland', {kind: 'country'}), {title: 'Swiss banking sector faces tighter rules'}, true],
    [company('Switzerland', {kind: 'country'}), {title: 'Drumline performs in Switzerland'}, false],
    [company('Switzerland', {kind: 'country'}), {title: 'Japan stocks rise', summary: 'Related stories: Swiss banking outlook'}, false],
    [company('United States', {kind: 'country'}), {title: 'Tell us about your stock investments'}, false],
    [company('United States', {kind: 'country'}), {title: 'U.S. inflation slows'}, true],
    [company('United States', {kind: 'country'}), {title: 'North America stock markets rise'}, false],
    [company('USA', {kind: 'country'}), {title: 'United States central bank raises interest rates'}, true],
  ];
  for (const [target, article, expected] of cases) assert.equal(matchesNewsTarget(article, target), expected, `${target.name}: ${article.title}`);
});

test('ticker evidence cannot attach a vessel or disaster to an issuer', () => {
  const target = company('Apple', { symbol: 'AAPL' });
  assert.equal(matchesNewsTarget({ title: 'Quarterly results released', tickers: ['AAPL'] }, target), true);
  assert.equal(matchesNewsTarget({ title: 'Quarterly results released', tickers: ['AAP'] }, target), false);
  assert.equal(matchesNewsTarget({ title: 'Apple tanker enters port', tickers: ['AAPL'], layer: 'shipping' }, target), false);
  assert.equal(matchesNewsTarget({ title: 'Apple shares plunge', tickers: ['AAPL'], portfolioMatch: 'none' }, target), false);
});

test('real client targets retain accent, acronym and share-class headline coverage', () => {
  const data: Dataset = JSON.parse(readFileSync(new URL('../../public/data/case-data.json', import.meta.url), 'utf8'));
  const fixtures = [
    {client: 'CASE-044', name: 'Nestlé SA', title: 'Nestle raises dividend'},
    {client: 'CASE-047', name: 'SAP SE', title: 'SAP raises revenue guidance'},
    {client: 'CASE-047', name: 'ABB Ltd', title: 'ABB earnings rise'},
    {client: 'CASE-047', name: 'Alphabet · Class C', title: 'Alphabet raises earnings guidance'},
    {client: 'CASE-038', name: 'Union Pacific', title: 'Union Pacific earnings beat forecasts'},
  ];
  for (const fixture of fixtures) {
    const client = data.clients.find(c => c.ClientRef === fixture.client)!;
    assert.ok(client, fixture.client);
    const target = newsTargets(analyze(data, client)).find(t => t.name === fixture.name);
    assert.ok(target, `${fixture.client} / ${fixture.name}`);
    assert.equal(matchesNewsTarget({title: fixture.title}, target), true, `${fixture.client} / ${fixture.name}`);
  }
});
