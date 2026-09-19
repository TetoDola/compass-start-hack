import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNewsQualityJobs } from '../scripts/ingestion-news-quality.ts';
import { assessNewsJobs } from '../scripts/assess-news-ingestion.ts';
import type { IngestionContextDocument } from '../scripts/capture-ingestion-context.ts';
import type { NewsTarget } from '../src/lib/briefing.ts';

const apple: NewsTarget = { id: 'instrument:apple', name: 'Apple Inc.', via: 'Direct position', weight: .2 };
const microsoft: NewsTarget = { id: 'instrument:microsoft', name: 'Microsoft Corp.', via: 'Fund', weight: .1 };
const article: IngestionContextDocument = { id: 'news:1', kind: 'news', source: 'Fixture', text: 'Apple reports earnings', sourceUrl: 'https://example.com/article', metadata: { baselineTargetIds: [apple.id] } };
const context = { documents: [article], targets: [apple, microsoft] };
const raw = { scopes: [
  { clientRef: 'A', clientId: '1', scope: 'all', targets: [apple] },
  { clientRef: 'B', clientId: '2', scope: 'all', targets: [microsoft] },
] };
const job = (matches: unknown[]) => [{ id: 'news-entities-001', kind: 'news-entities', actual: [{ articleId: article.id, matches }] }];

test('labeled issuer challenge scores a geographic false issuer match as a false positive', () => {
  const fixture = buildNewsQualityJobs(context)[0];
  const cases = (fixture.input as { cases: Array<{ id: string; title: string }> }).cases;
  const response = (fixture.expected as Array<{ id: string; matched: boolean }>).map((r, i) => ({ ...r, evidence: r.matched ? [cases[i].title] : [] }));
  response[0] = { ...response[0], matched: true, evidence: [cases[0].title] };
  const checked = fixture.validate(response);
  assert.equal(checked.labelMetrics?.falsePositives, 1);
  assert.equal(checked.labelMetrics?.correct, 24);
  const assessed = assessNewsJobs([{ id: fixture.id, kind: fixture.kind, actual: response }], context, raw);
  assert.equal(assessed.summary.labeledChallenge.falsePositives, 1);
  assert.equal(assessed.summary.labeledChallenge.accuracy, 24 / 25);
});

test('invented evidence is rejected even when the target identifier is real', () => {
  const result = assessNewsJobs(job([{ targetId: apple.id, evidenceQuote: 'Apple declares bankruptcy' }]), context, raw);
  assert.equal(result.summary.acceptedModelMatches, 0);
  assert.equal(result.examples.unsupported.length, 1);
  assert.match(result.examples.unsupported[0].reason, /exact nonempty source span/);
  assert.deepEqual(result.perScope[0].modelArticleIds, []);
  assert.equal(result.perScope[0].ledger[0].disagreementStatus, 'unadjudicated');
});

test('unknown IDs cannot contaminate either client ledger; valid ownership remains scoped', () => {
  const result = assessNewsJobs(job([{ targetId: 'instrument:invented', evidenceQuote: 'Apple' }, { targetId: apple.id, evidenceQuote: 'Apple' }]), context, raw);
  assert.equal(result.summary.acceptedModelMatches, 1);
  assert.equal(result.summary.unsupportedRecords, 1);
  assert.deepEqual(result.perScope[0].modelArticleIds, [article.id]);
  assert.deepEqual(result.perScope[1].ledger, []);
  assert.equal(result.perScope[0].ledger[0].modelMatches[0].sourceWeight, .2);
  assert.ok(!JSON.stringify(result.perScope).includes('instrument:invented'));
});

test('unfinished extraction is unassessed, not scored as a baseline omission', () => {
  const result = assessNewsJobs([], context, raw);
  assert.equal(result.summary.unassessedArticles, 1);
  assert.equal(result.summary.baselineOnlyMatches, 0);
  assert.equal(result.perScope[0].ledger[0].modelStatus, 'not-assessed');
  assert.equal(result.summary.labeledChallenge.accuracy, null);
});
