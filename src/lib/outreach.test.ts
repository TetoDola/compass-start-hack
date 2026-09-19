import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDevelopments, buildOutreachBook, candidateTargets, normalizeArticles, recentPublication, scoreRecommendation, statusKey, type Article, type ClassifiedArticle, type ClientScope } from './outreach';
import { mergeJsonUploads } from './import';
import type { Dataset } from './types';
import type { ContextItem, NewsTarget } from './briefing';

const now = Date.parse('2026-09-19T12:00:00Z');
const target: NewsTarget = { id: 'company:acme', name: 'Acme Corp', via: 'Direct position', weight: .12 };
const article: Article = { id: 'a', title: 'Acme Corp files for bankruptcy', summary: 'Claims must be filed by 2026-09-20.', source: 'Example', url: 'https://example.com/a', publishedAt: '2026-09-19T10:00:00Z', layer: 'news', sources: [{ name: 'Example', url: 'https://example.com/a' }] };
const scope: ClientScope = { clientId: 1, name: 'Ada', scope: 'all', scopeName: 'All compatible portfolios', targets: [target], partialFunds: false };
const row: ClassifiedArticle = { article, classification: { type: 'distress', status: 'reported', evidence: article.title, matches: [{ targetId: target.id, evidence: article.title }], eventDate: null, eventDateEvidence: null, timing: 'deadline', timingEvidence: article.summary, deadline: '2026-09-20', mode: 'minimax' } };

test('rolling seven days excludes older/future/invalid publications at both ingestion and ranking', () => {
  assert.ok(recentPublication('2026-09-12T12:00:00Z', now));
  for (const publishedAt of ['2026-09-12T11:59:59Z', '2026-09-20', 'invalid']) {
    assert.equal(recentPublication(publishedAt, now), false);
    assert.equal(scoreRecommendation({ ...row, article: { ...article, publishedAt } }, scope, target, now), undefined);
  }
});
test('urgency is deterministic per client, honors thresholds and decays after deadline', () => {
  const high = scoreRecommendation(row, scope, target, now)!;
  assert.equal(high.urgency, 10);
  assert.deepEqual(scoreRecommendation(row, scope, target, now), high);
  assert.equal(scoreRecommendation(row, scope, { ...target, weight: .01 }, now)!.urgency, 8);
  assert.equal(scoreRecommendation(row, scope, { ...target, weight: null }, now)!.components[2].points, 0);
  assert.equal(scoreRecommendation(row, scope, target, Date.parse('2026-09-21'))!.urgency, 8);
  assert.equal(scoreRecommendation(row, scope, { ...target, via: 'Covered equity fund' }, now)!.urgency, 9);
});
test('speculation, fallback, broad geography and republished old events cannot become high urgency', () => {
  for (const status of ['denial', 'speculation', 'unclear'] as const) assert.equal(scoreRecommendation({ ...row, classification: { ...row.classification, status } }, scope, target, now)!.urgency, 3);
  assert.equal(scoreRecommendation({ ...row, classification: { ...row.classification, mode: 'rules' } }, scope, target, now)!.urgency, 6);
  assert.equal(scoreRecommendation(row, scope, { ...target, kind: 'country' }, now)!.urgency, 6);
  assert.equal(scoreRecommendation({ ...row, classification: { ...row.classification, eventDate: '2020-01-01', timing: 'none', deadline: null } }, scope, target, now)!.urgency, 3);
});
test('deduplication removes tracking URLs and syndicated headlines, preserving sources and updates', () => {
  const base: ContextItem = { ...article, kind: 'news', entityIds: [], provider: 'test', retrievedAt: article.publishedAt, relevance: '' };
  const result = normalizeArticles([base, { ...base, id: 'b', url: 'https://example.com/a?utm_source=mail#top' }, { ...base, id: 'c', source: 'Other', url: 'https://other.com/story' }, { ...base, publishedAt: '2020-01-01' }], now);
  assert.equal(result.length, 1); assert.equal(result[0].sources.length, 2);
  const updated = normalizeArticles([base, { ...base, title: 'Acme Corp exits bankruptcy', publishedAt: '2026-09-19T11:00:00Z' }], now);
  assert.equal(updated.length, 1); assert.match(updated[0].title, /exits/);
});
test('ambiguous issuers and geographic signals cannot manufacture company exposure', () => {
  assert.equal(candidateTargets({ ...article, title: 'Visa rules for business investors change', summary: '' }, [{ ...target, name: 'Visa Inc' }]).length, 0);
  assert.equal(candidateTargets({ ...article, layer: 'disaster' }, [target]).length, 0);
});
test('distinct global observations sharing a provider map URL remain separate', () => {
  const base: ContextItem = { ...article, kind: 'news', layer: 'disaster', entityIds: [], provider: 'test', retrievedAt: article.publishedAt, relevance: '' };
  assert.equal(normalizeArticles([{ ...base, id: 'quake-1' }, { ...base, id: 'quake-2' }], now).length, 2);
});
test('recommendations deduplicate client scopes without summing overlapping weights or conflicting reports', () => {
  const rows = buildDevelopments([row], [scope, { ...scope, scope: '42', targets: [{ ...target, weight: .2 }] }], now);
  assert.equal(rows.length, 1); assert.equal(rows[0].recommendations.length, 1);
  assert.equal(rows[0].recommendations[0].target.weight, .12);
  assert.equal(buildDevelopments([row, { ...row, classification: { ...row.classification, status: 'denial' } }], [scope], now).length, 2);
  const r = rows[0].recommendations[0];
  assert.notEqual(statusKey(rows[0], r), statusKey(rows[0], { ...r, name: 'Different imported client' }));
});
test('new JSON clients and their reference data enter the book and retain their own record evidence', () => {
  const dataset: Dataset = { version: 'case', clients: [{ ClientId: 1, ClientRef: 'OLD', FirstName: 'Existing', Portfolios: [] }], reference: { Securities: [], RiskProfiles: [], StrategicAssetAllocations: [], FundBreakdowns: [] } };
  const client = { ClientId: 777, ClientRef: 'PARTNER-777', FirstName: 'Partner', LastName: 'Demo', ReportingCurrency: 'CHF', Portfolios: [{ PortfolioId: 7770, PortfolioNr: 'DEMO-DEPOT', PortfolioCurrency: 'CHF', FactoryDateUtc: '2026-09-18', AssetsUnderManagementInDefaultCurrency: 100000, SecurityPositions: [{ SecurityId: 9876, SecurityName: 'Acme Corp', PortfolioValuePercentage: .12, TotalAmountInPortfolioCurrency: 12000 }] }] };
  const reference = { Securities: [{ Id: 9876, Name: 'Acme Corp', SecurityTypeName: 'Shares', Isin: 'US0000000001', IndustryName: 'Information Technology', CountryName: 'United States', SAA_AssetClassName: 'Equities' }] };
  assert.equal(buildOutreachBook(dataset).targets.length, 0);
  const imported = mergeJsonUploads(dataset, [{ name: 'new-cases.json', text: JSON.stringify([client]) }, { name: 'reference.json', text: JSON.stringify(reference) }]).dataset;
  const book = buildOutreachBook(imported), newScope = book.scopes.find(s => s.clientId === 777)!;
  const direct = newScope.targets.find(t => t.isin === 'US0000000001')!;
  assert.ok(direct); assert.match(newScope.name, /Partner/);
  assert.equal(book.scopes.length, 2);
  assert.equal(book.targets.find(t => t.id === direct.id)?.weight, null, 'public catalog contains no client weights');
  assert.equal(book.targets.find(t => t.id === direct.id)?.classificationEvidence, undefined);
  const development = buildDevelopments([{ ...row, classification: { ...row.classification, matches: [{ targetId: direct.id, evidence: article.title }] } }], book.scopes, now)[0];
  assert.deepEqual(development.recommendations.map(r => r.clientId), [777]);
  assert.equal(development.recommendations[0].urgency, 10);
  assert.ok(development.recommendations[0].recordEvidence.some(e => e.location.includes('7770') && e.location.includes('SecurityPositions')));
  assert.equal(buildOutreachBook(mergeJsonUploads(imported, [{ name: 'repeat.json', text: JSON.stringify([client]) }]).dataset).scopes.length, 2);
});
