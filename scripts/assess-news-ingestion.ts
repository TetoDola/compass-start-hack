import { buildNewsQualityJobs } from './ingestion-news-quality.ts';
import { targetNames } from '../src/lib/newsMatching.ts';
import type { NewsTarget } from '../src/lib/briefing.ts';
import type { IngestionContextCapture } from './capture-ingestion-context.ts';

interface RecordedJob { id: string; kind: string; actual?: unknown; state?: string }
interface Scope { clientRef: string; clientId: string; scope: string; targets: NewsTarget[] }
interface Match { targetId: string; evidenceQuote: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const normalized = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Pure assessment of frozen model output. Baseline disagreement is never truth. */
export function assessNewsJobs(jobs: RecordedJob[], context: Pick<IngestionContextCapture, 'documents' | 'targets'>, rawCapture: { scopes: Scope[] }) {
  const articles = context.documents.filter(d => d.kind === 'news');
  const byArticle = new Map(articles.map(a => [a.id, a]));
  const byTarget = new Map(context.targets.map(t => [t.id, t]));
  const unsupported: Array<{ jobId: string; articleId?: string; targetId?: string; evidenceQuote?: string; reason: string }> = [];
  const records = new Map<string, Array<{ jobId: string; row: Record<string, unknown> }>>();
  const newsJobs = jobs.filter(job => job.kind === 'news-entities');
  for (const job of newsJobs) {
    if (!Array.isArray(job.actual)) {
      unsupported.push({ jobId: job.id, reason: 'No usable article extraction array; records remain unassessed.' });
      continue;
    }
    for (const row of job.actual) {
      if (!object(row) || typeof row.articleId !== 'string' || !byArticle.has(row.articleId)) {
        unsupported.push({ jobId: job.id, articleId: object(row) && typeof row.articleId === 'string' ? row.articleId : undefined, reason: 'Unknown or malformed article ID.' });
        continue;
      }
      records.set(row.articleId, [...records.get(row.articleId) || [], { jobId: job.id, row }]);
    }
  }
  const accepted = new Map<string, Match[]>();
  for (const [articleId, occurrences] of records) {
    const { jobId, row } = occurrences[0];
    if (occurrences.length !== 1 || !Array.isArray(row.matches)) {
      unsupported.push({ jobId, articleId, reason: occurrences.length !== 1 ? 'Duplicate article response; ambiguous record excluded.' : 'Missing or malformed matches array.' });
      continue;
    }
    const article = byArticle.get(articleId)!, matches: Match[] = [], seen = new Set<string>();
    for (const match of row.matches) {
      const targetId = object(match) && typeof match.targetId === 'string' ? match.targetId : undefined;
      const evidenceQuote = object(match) && typeof match.evidenceQuote === 'string' ? match.evidenceQuote : undefined;
      const target = targetId ? byTarget.get(targetId) : undefined;
      const quote = evidenceQuote || '', span = ` ${normalized(quote)} `;
      const reason = !target ? 'Unknown or malformed target ID.'
        : !quote.trim() || !article.text.includes(quote) ? 'Evidence quote is not an exact nonempty source span.'
        : ![target.name, ...target.aliases || [], ...targetNames(target)].some(name => !!normalized(name) && span.includes(` ${normalized(name)} `)) ? 'Evidence quote lacks the target name or a supplied alias.'
        : seen.has(target.id) ? 'Duplicate target match excluded.' : undefined;
      if (reason) unsupported.push({ jobId, articleId, targetId, evidenceQuote, reason });
      else { seen.add(target!.id); matches.push({ targetId: target!.id, evidenceQuote: quote }); }
    }
    // Empty is a recorded abstention, never proof that the article is irrelevant.
    accepted.set(articleId, matches);
  }
  const evaluated = articles.map(article => {
    const model = accepted.get(article.id), modelIds = new Set(model?.map(m => m.targetId) || []);
    const baseline = [...new Set(Array.isArray(article.metadata?.baselineTargetIds) ? article.metadata.baselineTargetIds.filter((id): id is string => typeof id === 'string' && byTarget.has(id)) : [])];
    const baselineIds = new Set(baseline);
    const modelOnly = model === undefined ? [] : [...modelIds].filter(id => !baselineIds.has(id));
    const baselineOnly = model === undefined ? [] : baseline.filter(id => !modelIds.has(id));
    return { articleId: article.id, headline: article.text.split('\n')[0], source: article.source, sourceUrl: article.sourceUrl, publishedAt: article.publishedAt,
      modelStatus: model === undefined ? 'not-assessed' as const : 'assessed' as const,
      modelMatches: (model || []).map(m => ({ ...m, targetName: byTarget.get(m.targetId)!.name })),
      baselineMatches: baseline.map(targetId => ({ targetId, targetName: byTarget.get(targetId)!.name })),
      modelOnly, baselineOnly, disagreementStatus: model === undefined ? 'not-assessed' : modelOnly.length || baselineOnly.length ? 'unadjudicated' : 'same-target-set-not-verified',
    };
  });
  const perScope = rawCapture.scopes.map(scope => {
    const local = new Map(scope.targets.map(t => [t.id, t]));
    const ledger = evaluated.flatMap(article => {
      const modelMatches = article.modelMatches.filter(m => local.has(m.targetId));
      const baselineMatches = article.baselineMatches.filter(m => local.has(m.targetId));
      if (!modelMatches.length && !baselineMatches.length) return [];
      const decorate = <T extends { targetId: string }>(match: T) => {
        const target = local.get(match.targetId)!;
        return { ...match, targetName: target.name, kind: target.kind || 'company', via: target.via,
          sourceWeight: target.weight != null && Number.isFinite(target.weight) && target.weight >= 0 && target.weight <= 1 ? target.weight : null };
      };
      const modelOnly = article.modelOnly.filter(id => local.has(id)), baselineOnly = article.baselineOnly.filter(id => local.has(id));
      return [{ ...article, modelMatches: modelMatches.map(decorate), baselineMatches: baselineMatches.map(decorate), modelOnly, baselineOnly,
        disagreementStatus: article.modelStatus === 'not-assessed' ? 'not-assessed' : modelOnly.length || baselineOnly.length ? 'unadjudicated' : 'same-target-set-not-verified' }];
    });
    return { clientRef: scope.clientRef, clientId: scope.clientId, scope: scope.scope, targetCount: local.size,
      modelArticleIds: [...new Set(ledger.filter(a => a.modelMatches.length).map(a => a.articleId))],
      baselineArticleIds: [...new Set(ledger.filter(a => a.baselineMatches.length).map(a => a.articleId))],
      unionArticleIds: ledger.map(a => a.articleId), unadjudicatedDisagreements: ledger.filter(a => a.disagreementStatus === 'unadjudicated').length,
      ledger };
  });
  const fixture = buildNewsQualityJobs({ documents: [], targets: context.targets })[0];
  const fixtureRuns = jobs.filter(j => j.kind === 'news-labeled-quality');
  const fixtureActual = fixtureRuns.length === 1 && Array.isArray(fixtureRuns[0].actual) ? fixtureRuns[0].actual : undefined;
  const expected = fixture.expected as Array<{ id: string; matched: boolean }>;
  let truePositives = 0, falsePositives = 0, trueNegatives = 0, falseNegatives = 0, missingOrInvalid = 0;
  for (const label of expected) {
    const rows = (fixtureActual || []).filter(row => object(row) && row.id === label.id);
    if (rows.length !== 1 || typeof rows[0].matched !== 'boolean') { missingOrInvalid++; continue; }
    if (label.matched) { if (rows[0].matched) truePositives++; else falseNegatives++; }
    else { if (rows[0].matched) falsePositives++; else trueNegatives++; }
  }
  const labeledChallenge = { status: fixtureActual ? 'assessed' : 'not-assessed', cases: expected.length, truePositives, falsePositives, trueNegatives, falseNegatives, missingOrInvalid,
    accuracy: fixtureActual ? (truePositives + trueNegatives) / expected.length : null,
    precision: truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : null,
    recall: fixtureActual ? truePositives / expected.filter(e => e.matched).length : null,
    validation: fixtureActual ? fixture.validate(fixtureActual) : null,
  };
  const disagreements = evaluated.filter(a => a.disagreementStatus === 'unadjudicated');
  return {
    summary: { newsDocuments: articles.length, extractionJobs: newsJobs.length, assessedArticles: accepted.size, unassessedArticles: articles.length - accepted.size,
      acceptedModelMatches: [...accepted.values()].reduce((n, m) => n + m.length, 0), unsupportedRecords: unsupported.length,
      unadjudicatedArticleDisagreements: disagreements.length, sameTargetSets: evaluated.filter(a => a.disagreementStatus === 'same-target-set-not-verified').length,
      modelOnlyMatches: disagreements.reduce((n, a) => n + a.modelOnly.length, 0), baselineOnlyMatches: disagreements.reduce((n, a) => n + a.baselineOnly.length, 0),
      scopeCount: perScope.length, clientCount: new Set(perScope.map(s => s.clientId)).size, labeledChallenge },
    perScope,
    examples: { unadjudicated: disagreements.slice(0, 25), unsupported, note: 'First 25 disagreements are examples. Every scope ledger and every rejected record are retained.' },
    limitations: [
      'Live semantic disagreements are unadjudicated. The deterministic baseline is not ground truth; agreement is not independent verification.',
      'Accepted model matches pass known-ID and exact lexical evidence checks only. They may still confuse similarly named issuers or generic words.',
      'Missing or malformed article responses are not assessed and are not counted as semantic omissions. Empty matches are abstentions with unknown recall.',
      'The 25 synthetic labeled examples measure a narrow issuer-disambiguation task. Their accuracy, precision and recall do not establish live-corpus accuracy.',
      'Per-scope article IDs are set unions. Source weights are displayed individually and never summed; classifications, funds and client scopes may overlap.',
      'The corpus contains available headlines and supplied summaries, not complete article bodies. Client ownership comes from the frozen deterministic scope index.',
    ],
  };
}
