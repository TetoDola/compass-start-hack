import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './analysis';
import { parseDatasetUpload } from './import';
import { briefingCandidates, defaultSelection, instrumentId, newsTargets, validateSelection } from './briefing';
import { buildNetwork } from './network';
import type { Dataset } from './types';

const dataset: Dataset = JSON.parse(readFileSync(new URL('../../public/data/case-data.json', import.meta.url), 'utf8'));
const customer = (ref: string) => dataset.clients.find(c => c.ClientRef === ref)!;
test('overlapping consolidated scopes never sum values or show combined exposure weights', () => {
  const a = analyze(dataset, customer('CASE-038'));
  assert.equal(a.scopeAmbiguous, true); assert.equal(a.aum, null); assert.equal(a.liquidity, null); assert.equal(a.weightsAvailable, false); assert.deepEqual(a.history, []);
  assert.ok(a.holdings.every(h => h.weight === 0));
  const candidates = briefingCandidates(a); assert.deepEqual(defaultSelection(candidates).health, ['scope']);
  assert.throws(() => validateSelection({ ...defaultSelection(candidates), health: ['fact:recorded-issues'] }, candidates), /omitted/);
  const single = analyze(dataset, customer('CASE-038'), '140557'); assert.equal(single.aum, 1619901.11531); assert.equal(single.weightsAvailable, true);
});
test('material older customer needs stay dated and require confirmation', () => {
  const a = analyze(dataset, customer('CASE-012')); const context = a.findings.find(f => f.id === 'customer-context')!;
  assert.match(context.body, /15,000/); assert.match(context.body, /confirm/); assert.match(context.evidence[0].date!, /^2026-03-20/);
  assert.equal(a.evidence.filter(e => e.id.startsWith('note-')).length, a.notes.length);
  assert.ok(a.holdings.every(h => h.priceDate));
});
test('all scopes produce valid four-part briefs and closed networks', () => {
  for (const c of dataset.clients) for (const scope of ['all', ...c.Portfolios.map((p: any) => String(p.PortfolioId))]) {
    const a = analyze(dataset, c, scope); const candidates = briefingCandidates(a);
    validateSelection(defaultSelection(candidates), candidates);
    const network = buildNetwork(a, new Set(a.holdings.map(h => instrumentId(h.isin, h.id))));
    const ids = new Set(network.nodes.map(n => n.id)); assert.equal(ids.size, network.nodes.length);
    for (const e of network.edges) assert.ok(ids.has(e.source) && ids.has(e.target), `${c.ClientRef}: dangling edge`);
    for (const n of network.nodes) for (const evidence of n.evidence) assert.ok(evidence.fields.every(f => typeof f.value === 'string'));
  }
});
test('same verified security joins direct and indirect paths; names alone do not merge', () => {
  const a = analyze(dataset, customer('CASE-012')); const fund = a.holdings.find(h => h.isin === 'IE00B4L5Y983')!;
  const closed = buildNetwork(a, new Set());
  const expanded = buildNetwork(a, new Set([instrumentId(fund.isin, fund.id)]));
  const apple = expanded.nodes.find(n => n.id === 'instrument:US0378331005')!;
  assert.ok(apple.evidence.some(e => e.id.startsWith('holding-'))); assert.ok(apple.evidence.some(e => e.id.startsWith('constituent:')));
  assert.ok(expanded.nodes.length > closed.nodes.length);
  const clone = structuredClone(a); clone.holdings.find(h => h.id === fund.id)!.fundHoldings!.holdings.find(h => h.isin === 'US0378331005')!.isin = undefined;
  const unknown = buildNetwork(clone, new Set([instrumentId(fund.isin, fund.id)]));
  assert.ok(unknown.nodes.some(n => n.id.startsWith('underlying:') && /apple/i.test(n.name)));
  assert.ok(!unknown.nodes.find(n => n.id === apple.id)!.evidence.some(e => e.id.startsWith('constituent:')));
});
test('an unseen client-plus-reference import replaces security IDs rather than borrowing old classifications', () => {
  const c = { ClientId: 7654321, ClientRef: 'UNSEEN-TEST', Portfolios: [{ PortfolioId: 333, SecurityPositions: [{ SecurityId: 42, SecurityName: 'New security', TotalAmountInPortfolioCurrency: 500, PortfolioValuePercentage: 1 }] }] };
  const imported = parseDatasetUpload(JSON.stringify({ clients: [c], reference: { Securities: [{ Id: 42, Isin: 'US0378331005', Name: 'Apple', SecurityTypeName: 'Shares', SAA_AssetClassName: 'Shares', IndustryName: 'Information Technology' }] } }), dataset.reference);
  assert.equal(imported.reference.Securities.length, 1); assert.equal(imported.suppliedReference, true);
  const a = analyze({ ...dataset, ...imported }, imported.clients[0]); assert.equal(a.holdings[0].isin, 'US0378331005'); assert.equal(newsTargets(a)[0].id, 'instrument:US0378331005');
  assert.throws(() => parseDatasetUpload(JSON.stringify({ clients: [c], reference: { Securities: [{ Id: 1 }, { Id: 1 }] } }), dataset.reference), /unique/);
});
test('AI cannot introduce a candidate from another client or section', () => {
  const candidates = briefingCandidates(analyze(dataset, customer('CASE-012')));
  assert.throws(() => validateSelection({ ...defaultSelection(candidates), health: ['invented'] }, candidates), /grounded/);
  assert.throws(() => validateSelection({ ...defaultSelection(candidates), health: ['fact:customer-context'] }, candidates), /grounded/);
});
