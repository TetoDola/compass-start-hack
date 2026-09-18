import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFundPage } from './fund-holdings';

const html = readFileSync(new URL('./fixtures/top-holdings.html', import.meta.url), 'utf8');
test('published top-ten parsing preserves the date, security identity and partial weights', () => {
  const result = parseFundPage(html, 'IE00B4L5Y983');
  assert.equal(result.asOf, '2026-07-30');
  assert.equal(result.holdings.length, 10);
  assert.equal(result.holdings[0].name, 'Apple');
  assert.equal(result.holdings[0].isin, 'US0378331005');
  assert.equal(result.holdings[0].weight, .0548);
  assert.equal(result.holdings[9].name, 'JPMorgan Chase & Co.');
  assert.ok(Math.abs(result.holdings.reduce((sum, h) => sum + h.weight, 0) - .2597) < .00001);
});
test('source mismatch, missing dates and invalid totals cannot become holdings', () => {
  assert.throws(() => parseFundPage(html, 'IE00B5BMR087'), /ISIN/);
  assert.throws(() => parseFundPage(html.replace('30/07/2026', 'unknown'), 'IE00B4L5Y983'), /dated/);
  assert.throws(() => parseFundPage(html.replace('25.97%', '100%'), 'IE00B4L5Y983'), /reconcile/);
  assert.throws(() => parseFundPage(html.replace('5.48%', '-5.48%'), 'IE00B4L5Y983'), /valid/);
});
