import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './analysis';
import { newsTargets, type MarketContext } from './briefing';
import { buildNetwork, ownershipTrace } from './network';
import { portfolioExposures } from './portfolio';
import type { Dataset } from './types';

const data: Dataset = JSON.parse(readFileSync(new URL('../../public/data/case-data.json', import.meta.url), 'utf8'));
const analysis = (ref = 'CASE-012') => analyze(data, data.clients.find(c => c.ClientRef === ref)!);
const fundAnalysis = () => {
  const a = structuredClone(analysis());
  a.holdings = [a.holdings.find(h => h.isin === 'IE00B4L5Y983')!];
  return a;
};

test('complete constituent snapshots use all supplied holdings in targets and exposure totals', () => {
  const a = fundAnalysis();
  const fund = a.holdings[0];
  fund.fundBreakdown = undefined;
  fund.fundHoldings!.coverage = 'complete';
  fund.fundHoldings!.holdings = Array.from({ length: 12 }, (_, i) => ({ name: `Constituent ${i}`, weight: 1 / 12, country: i < 10 ? 'Switzerland' : 'United States of America' }));
  const companies = portfolioExposures(a, 'company');
  assert.equal(companies.length, 12);
  assert.ok(Math.abs(companies.reduce((sum, c) => sum + c.weight, 0) - fund.weight) < 1e-12);
  assert.equal(newsTargets(a).filter(t => !t.kind).length, 12);
  const us = portfolioExposures(a, 'country').find(c => c.name === 'United States of America')!;
  assert.ok(Math.abs(us.weight - fund.weight / 6) < 1e-12);
  assert.equal(us.evidence[0].location, fund.fundHoldings!.sourceUrl);
  assert.equal(us.evidence[0].date, fund.fundHoldings!.asOf);
});

test('world news about the twelfth published constituent traces to its fund and client portfolio', () => {
  const a = fundAnalysis();
  const fund = a.holdings[0];
  fund.fundBreakdown = undefined;
  fund.fundHoldings!.coverage = 'complete';
  fund.fundHoldings!.holdings = Array.from({ length: 12 }, (_, i) => ({ name: `Constituent ${i}`, weight: 1 / 12, country: 'Switzerland' }));
  const company = newsTargets(a).find(t => t.name === 'Constituent 11')!;
  const context: MarketContext = { items: [{ id: 'news:twelfth', kind: 'news', title: 'Constituent 11 files for bankruptcy', source: 'Test fixture', url: 'https://example.com/report', publishedAt: '2026-09-19T00:00:00Z', retrievedAt: '2026-09-19T00:00:00Z', entityIds: [company.id], relevance: 'Matched exact company', provider: 'fixture' }], checked: 1, requested: 1, warnings: [], elapsedMs: 0, fetchedAt: '2026-09-19T00:00:00Z', providers: ['fixture'] };
  const network = buildNetwork(a, new Set([`instrument:${fund.isin}`]), context);
  const trace = ownershipTrace(network, 'news:twelfth');
  for (const id of ['customer', `p-${fund.portfolioId}`, `instrument:${fund.isin}`, company.id, 'news:twelfth']) assert.ok(trace.nodes.some(n => n.id === id), id);
  assert.equal(trace.nodes.find(n => n.id === company.id)?.materialEvent, true);
  assert.match(trace.edges.find(e => e.target === company.id)!.evidence[0].note!, /Published complete holdings/);
  assert.ok(network.edges.some(e => e.source === `instrument:${fund.isin}` && e.target === 'country:Switzerland'));
});

test('expanded graph excludes invalid rows and keeps non-equity source records as instruments', () => {
  const a = fundAnalysis();
  const fund = a.holdings[0];
  const expanded = new Set([`instrument:${fund.isin}`]);
  fund.fundHoldings!.holdings = [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY, 1.1, 0.2].map((weight, i) => ({ name: `Constituent ${i}`, weight }));
  const underlying = () => buildNetwork(a, expanded).nodes.filter(n => n.id.startsWith('underlying:'));
  assert.deepEqual(underlying().map(n => n.id), [`underlying:${fund.isin}:5`]);
  fund.weight = 0;
  assert.deepEqual(underlying(), []);
  fund.weight = 0.25;
  fund.asset = 'Real estate';
  assert.deepEqual(underlying().map(n => [n.id, n.type]), [[`underlying:${fund.isin}:5`, 'instrument']]);
  assert.ok(!newsTargets(a).some(t => t.id === `underlying:${fund.isin}:5`));
});

test('zero and malformed constituent weights cannot create client news targets', () => {
  const a = fundAnalysis();
  const fund = a.holdings[0];
  fund.fundHoldings!.holdings = [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY, 1.1, 0.2].map((weight, i) => ({ name: `Constituent ${i}`, weight }));
  const targets = newsTargets(a).filter(t => !t.kind);
  assert.deepEqual(targets.map(t => t.id), [`underlying:${fund.isin}:5`]);
  assert.equal(targets[0].weight, fund.weight * 0.2);
  assert.deepEqual(portfolioExposures(a, 'company').map(c => c.id), targets.map(t => t.id));
  a.weightsAvailable = false;
  assert.deepEqual(newsTargets(a).map(t => [t.id, t.weight]), [[targets[0].id, null]]);
});

test('inactive or invalid direct and fund positions do not generate weighted targets', () => {
  for (const weight of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY, 1.1]) {
    const a = structuredClone(analysis());
    for (const holding of a.holdings) holding.weight = weight;
    assert.deepEqual(newsTargets(a), [], `Invalid position weight ${weight}`);
    for (const kind of ['company', 'country', 'industry', 'region'] as const) assert.deepEqual(portfolioExposures(a, kind), []);
  }
});

test('country fallback respects the same equity look-through applicability as company targets', () => {
  for (const asset of ['Real estate', 'Bonds', 'Commodities', 'Not classified']) {
    const a = fundAnalysis();
    const fund = a.holdings[0];
    fund.asset = asset;
    fund.fundBreakdown = undefined;
    fund.fundHoldings!.holdings = [{ name: 'Underlying issuer', country: 'United States of America', weight: 0.25 }];
    assert.deepEqual(portfolioExposures(a, 'country'), [], asset);
    assert.deepEqual(newsTargets(a), [], asset);
  }
});

test('a constituent reached through repeated fund positions lists each route once', () => {
  const a = structuredClone(analysis());
  const fund = a.holdings.find(h => h.isin === 'IE00B4L5Y983')!;
  a.holdings.push({ ...structuredClone(fund), id: 'second-account-fund-position' });
  const target = newsTargets(a).find(t => t.isin === 'US0378331005')!;
  const via = target.via.split(' · ');
  assert.equal(via.length, new Set(via).size);
  assert.equal(target.weight, portfolioExposures(a, 'company').find(c => c.isin === target.isin)!.weight);
});

test('different published names become aliases only when an exact instrument ID joins them', () => {
  const a = structuredClone(analysis());
  const direct = a.holdings.find(h => h.isin === 'US0378331005')!;
  const fund = a.holdings.find(h => h.isin === 'IE00B4L5Y983')!;
  direct.displayName = 'Apple registered shares';
  const underlying = fund.fundHoldings!.holdings.find(c => c.isin === direct.isin)!;
  underlying.name = 'Apple Inc';
  fund.fundHoldings!.holdings.push({ name: 'Unverified Apple name', weight: 0.01 });
  const target = newsTargets(a).find(t => t.isin === direct.isin)!;
  assert.deepEqual(new Set([target.name, ...(target.aliases || [])]), new Set(['Apple registered shares', 'Apple Inc']));
  assert.ok(!target.aliases?.includes('Unverified Apple name'));
});

test('overlapping CASE-038 portfolios retain company identities without invented combined weights', () => {
  const a = analysis('CASE-038');
  const targets = newsTargets(a);
  assert.equal(a.scopeAmbiguous, true);
  assert.ok(targets.length > 0);
  assert.equal(new Set(targets.map(t => t.id)).size, targets.length);
  assert.ok(targets.every(t => t.weight === null && !t.kind));
});

test('every supplied client and scope uses the same company exposure weights for news and portfolio views', () => {
  for (const client of data.clients) for (const scope of ['all', ...client.Portfolios.map((p: any) => String(p.PortfolioId))]) {
    const a = analyze(data, client, scope);
    if (!a.weightsAvailable) continue;
    const targets = newsTargets(a).filter(t => !t.kind || t.kind === 'company');
    const companies = portfolioExposures(a, 'company');
    assert.equal(targets.length, companies.length, `${client.ClientRef}/${scope}`);
    for (const target of targets) assert.equal(target.weight, companies.find(c => c.id === target.id)?.weight, `${client.ClientRef}/${scope}/${target.id}`);
  }
});
