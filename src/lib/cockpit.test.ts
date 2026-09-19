import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './analysis';
import { breakdownRows, cockpitPrompts, portfolioEvents, riskContributors, saaTargets } from './cockpit';
import type { Dataset, Row } from './types';
const data: Dataset = JSON.parse(readFileSync('public/data/case-data.json', 'utf8'));
const customer = data.clients.find(c => c.ClientRef === 'CASE-038')!;
const advisory = customer.Portfolios.find((p: Row) => p.PortfolioNr === 'CASE-038-02')!;
const single = analyze(data, customer, String(advisory.PortfolioId));
const combined = analyze(data, customer);

test('policy targets are read for a single portfolio only, and never for an untargeted dimension', () => {
  const industry = saaTargets(single, data, 'industry');
  assert.ok(industry.get('Health Care')! > 0.2);
  assert.equal(saaTargets(single, data, 'company').size, 0);
  // Two overlapping portfolios have no single policy to compare against.
  assert.equal(saaTargets(combined, data, 'industry').size, 0);
});

test('a breakdown row carries its deviation only where a target exists under the same name', () => {
  const rows = breakdownRows(single, data, 'industry');
  const health = rows.find(r => r.name === 'Health Care')!;
  assert.equal(health.deviation, health.weight - health.target!);
  assert.ok(health.deviation! < 0, 'the supplied case is underweight health care');
  // "Raw materials" and "Materials" are the same bucket; an unmatched name stays untargeted.
  assert.ok(rows.find(r => r.name === 'Raw materials')?.target);
  for (const row of rows) assert.equal(row.target == null, row.deviation == null);
  for (const row of breakdownRows(single, data, 'company')) assert.equal(row.target, null);
});

test('a recorded finding is attached to the exposure its rule names, and only that one', () => {
  const rows = breakdownRows(single, data, 'industry');
  const flagged = rows.filter(r => r.violation);
  assert.ok(flagged.length, 'the supplied case flags at least one industry');
  for (const row of flagged) assert.ok(String(row.violation!.RuleCode).includes(`"${row.name}"`));
  assert.ok(rows.some(r => !r.violation), 'unflagged rows stay unflagged');
});

test('risk contributors use the supplied volatility contribution, ranked and never negative', () => {
  const ranked = riskContributors(single);
  assert.ok(ranked.length > 3);
  for (const [i, holding] of ranked.entries()) {
    assert.ok(holding.riskContribution! > 0);
    if (i) assert.ok(holding.riskContribution! <= ranked[i - 1].riskContribution!);
  }
  // A contribution is a share of risk, not of value: the two rankings need not agree.
  assert.ok(ranked.every(h => h.weight >= 0));
});

test('events and prompts stay empty-safe without news, and prompts trace back to a record', () => {
  assert.deepEqual(portfolioEvents(single, null), []);
  const prompts = cockpitPrompts(single, data, null);
  assert.ok(prompts.length && prompts.length <= 5);
  assert.deepEqual(prompts.map(p => p.level), [...prompts.map(p => p.level)].sort((a, b) => ({ breach: 0, warning: 1, gap: 2, note: 3 })[a] - ({ breach: 0, warning: 1, gap: 2, note: 3 })[b]));
  for (const prompt of prompts) assert.ok(prompt.evidence.length, `${prompt.id} has a source`);
  assert.ok(prompts.some(p => p.level === 'gap'), 'the largest target deviation is offered as an action');
});
