import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPdfJobs } from '../scripts/assess-pdf-ingestion';

const expected = {
  owner: 'Fixture owner', currency: 'CHF', total: 1500,
  positions: [
    { isin: 'CH0000000001', page: 6, name: 'First security', currency: 'CHF', quantity: 10, value: 1000, weight: 2 / 3, cost: 90, price: 100 },
    { isin: 'CH0000000002', page: 7, name: 'Second security', currency: 'CHF', quantity: 5, value: 500, weight: 1 / 3, cost: 95, price: 100 },
  ],
  cash: [], contributions: [], allocations: [], sustainability: [], transactions: [], performanceHistory: [], currencyMatrix: [],
};
function assess(actual: typeof expected) { return assessPdfJobs([{ id: 'pdf-01', expected, actual }]); }

test('PDF factual assessment aligns reordered unique ISIN/page rows without mutating results', () => {
  const actual = structuredClone(expected); actual.positions.reverse();
  const frozen = JSON.stringify(actual);
  const result = assess(actual);
  assert.deepEqual(result.summary.factualMetrics.sourceFacts, { checks: 21, passed: 21 });
  assert.equal(result.orderingChanges.length, 1);
  assert.equal(result.summary.factualMetrics.rows.missing, 0);
  assert.equal(JSON.stringify(actual), frozen);
});

test('PDF factual assessment penalizes an omitted security even when every surviving field is correct', () => {
  const actual = structuredClone(expected); actual.positions.pop();
  const result = assess(actual);
  assert.equal(result.summary.factualMetrics.rows.missing, 1);
  assert.equal(result.summary.factualMetrics.sourceFacts.checks, 21);
  assert.equal(result.summary.factualMetrics.sourceFacts.passed, 12);
  assert.equal(result.summary.factualMetrics.matchedFacts.checks, result.summary.factualMetrics.matchedFacts.passed);
});

test('PDF factual assessment separates changed cost quotes from order and correct market values', () => {
  const actual = structuredClone(expected); actual.positions[0].cost *= actual.positions[0].quantity;
  const result = assess(actual);
  assert.equal(result.summary.factualMetrics.rows.missing, 0);
  assert.equal(result.orderingChanges.length, 0);
  assert.equal(result.monetaryMismatches.length, 1);
  assert.equal(result.monetaryMismatches[0].field, 'cost');
  assert.equal(result.monetaryMismatches[0].expected, 90);
  assert.equal(result.monetaryMismatches[0].actual, 900);
});

test('PDF factual assessment refuses to select an arbitrary duplicated identity', () => {
  const actual = structuredClone(expected); actual.positions.push({ ...actual.positions[0] });
  const result = assess(actual);
  assert.equal(result.summary.factualMetrics.rows.duplicatedKeys, 1);
  assert.equal(result.summary.factualMetrics.rows.ambiguousExpected, 1);
  assert.equal(result.summary.factualMetrics.rows.ambiguousActual, 2);
  assert.equal(result.summary.factualMetrics.rows.matched, 1);
  assert.equal(result.summary.factualMetrics.sourceFacts.passed, 12);
});

test('PDF label/schema diagnostics preserve strict scores and tolerate only numeric rounding noise', () => {
  const source = { ...structuredClone(expected), allocations: [{ dimension: 'asset', scope: 'portfolio', label: 'Aktien', weight: 28.17 / 100, page: 5 }] };
  const actual = structuredClone(source); actual.allocations[0].dimension = 'asset-class'; actual.allocations[0].weight = 0.2817;
  const result = assessPdfJobs([{ id: 'pdf-01', expected: source, actual }]);
  assert.equal(result.identityChangeCandidates.length, 1);
  assert.deepEqual(result.identityChangeCandidates[0].changedFields, ['dimension']);
  assert.equal(result.summary.factualMetrics.rows.missing, 1);
  assert.equal(result.summary.factualMetrics.rows.extra, 1);
  actual.allocations[0].weight = 0.3;
  assert.equal(assessPdfJobs([{ id: 'pdf-01', expected: source, actual }]).identityChangeCandidates.length, 0);
});
