import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { analyze } from '../src/lib/analysis.ts';
import { newsTargets, type ContextItem, type MarketContext, type NewsTarget } from '../src/lib/briefing.ts';
import { loadMarketContext } from '../src/lib/loadContext.ts';
import { mergeContextItems } from '../src/lib/research.ts';
import { matchesNewsTarget } from '../src/lib/newsMatching.ts';
import type { Dataset } from '../src/lib/types.ts';
import type { WorldDigest } from '../src/lib/world.ts';

export interface IngestionContextDocument {
  id: string;
  kind: 'news' | 'world-sensor' | 'market-observation' | 'shipping-reference';
  source: string;
  text: string;
  sourceUrl?: string;
  publishedAt?: string;
  targetNames?: string[];
  metadata: Record<string, unknown>;
}
export interface IngestionContextCapture {
  documents: IngestionContextDocument[];
  targets: NewsTarget[];
  warnings: string[];
  coverage: Record<string, unknown>;
  artifacts: { raw: string; documents: string; coverage: string };
}

/** Freeze currently available public context once. No model requests or dataset mutations. */
export async function captureIngestionContext(dataset: Dataset, outputDir: string): Promise<IngestionContextCapture> {
  const output = path.resolve(outputDir), relative = path.relative(process.cwd(), output);
  if (!['test-results', '.cache', 'tmp'].some(root => relative === root || relative.startsWith(`${root}${path.sep}`))) {
    throw new Error('Context artifacts must be written inside ignored test-results/, .cache/, or tmp/.');
  }
  await mkdir(output, { recursive: true });
  const base = (process.env.INGESTION_CONTEXT_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
  const origin = new URL(base);
  if (!['http:', 'https:'].includes(origin.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.username || origin.password) {
    throw new Error('INGESTION_CONTEXT_BASE_URL must be a local Compass API origin.');
  }
  const capturedAt = new Date().toISOString(), warnings: string[] = [];
  const targetMap = new Map<string, NewsTarget>();
  const scopes: Array<{ clientRef: string; clientId: string; scope: string; targets: NewsTarget[] }> = [];
  for (const client of dataset.clients) {
    for (const scope of ['all', ...client.Portfolios.map((p: { PortfolioId: string | number }) => String(p.PortfolioId))]) {
      const targets = newsTargets(analyze(dataset, client, scope));
      scopes.push({ clientRef: client.ClientRef, clientId: String(client.ClientId), scope, targets });
      for (const target of targets) {
        const key = `${target.kind || 'company'}:${target.id}`, old = targetMap.get(key);
        if (old) {
          old.aliases = [...new Set([...(old.aliases || []), target.name, ...(target.aliases || [])])].filter(name => name !== old.name);
          // A corpus-wide target has no single client weight or classification.
          for (const field of ['country', 'region', 'industry', 'saaRegion', 'saaIndustry'] as const) if (old[field] !== target[field]) old[field] = undefined;
        } else targetMap.set(key, { ...target, aliases: target.aliases ? [...target.aliases] : undefined, weight: null, via: 'Public-context corpus; client ownership retained in scope index', classificationEvidence: undefined });
      }
    }
  }
  const targets = [...targetMap.values()];
  const artifacts = { raw: path.join(output, 'ingestion-context.raw.json'), documents: path.join(output, 'ingestion-context.documents.json'), coverage: path.join(output, 'ingestion-context.coverage.json') };
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  const post = async (endpoint: string, body: unknown, timeout: number): Promise<unknown> => {
    const response = await fetch(`${base}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error(`Compass ${endpoint} returned HTTP ${response.status}`);
    return response.json();
  };
  console.log(`[context capture] ${dataset.clients.length} clients, ${scopes.length} scopes, ${targets.length} unique exposure searches; checking local APIs.`);
  const [worldCheck, marketCheck] = await Promise.allSettled([
    post('/api/world-context', { refresh: true }, 30000),
    post('/api/market-context', { targets: [], days: 365, refresh: false }, 5000),
  ]);
  let world: WorldDigest = { articles: [], state: 'unavailable', retrievedAt: capturedAt, message: 'World context API unavailable during corpus capture.' };
  if (worldCheck.status === 'fulfilled' && Array.isArray((worldCheck.value as WorldDigest)?.articles)) world = worldCheck.value as WorldDigest;
  else warnings.push('World context API unavailable or malformed; no replacement news or sensor data was fabricated.');
  // Persist the world snapshot and all scope ownership before the longer news sweep.
  await writeFile(artifacts.raw, json({ capturedAt, sourceFormat: 'Full Compass API records; article bodies are unavailable unless supplied as snippets.', targets, scopes, world, market: null }));
  let market: MarketContext = { items: [], checked: 0, requested: targets.length, checkedIds: [], warnings: [], elapsedMs: 0, fetchedAt: capturedAt, providers: [], windowDays: 365 };
  const marketAvailable = marketCheck.status === 'fulfilled' && Array.isArray((marketCheck.value as MarketContext)?.items);
  if (marketAvailable) {
    let latestProgress = 0;
    // The existing loader bounds each batch to 20 seconds and runs exactly two
    // 12-target batches concurrently. Every unique target is attempted.
    market = await loadMarketContext(targets, { base, days: 365, refresh: true, signal: new AbortController().signal, onProgress: (partial, processed) => {
      if (processed === targets.length || processed - latestProgress >= 24) {
        latestProgress = processed;
        console.log(`[context capture] ${processed}/${targets.length} targets processed; ${partial.checked} searches returned, ${partial.items.length} deduplicated news records.`);
      }
    } });
    warnings.push(...market.warnings);
  } else warnings.push('Client-news API unavailable; none of the unique exposure searches could run.');
  if (world.state !== 'complete') warnings.push(`World news coverage: ${world.state}. ${world.message}`);
  warnings.push('No supplied research corpus was found in case inputs. Browser-local uploaded research is not accessible to this Node capture; placeholders are excluded.', 'The 365-day window filters available provider results; it is not a complete historical archive. At most two ranked news records per exposure are returned by the existing resolver.');
  const worldItems: ContextItem[] = [...world.articles, ...(world.signals || [])].map(article => ({
    id: article.id, kind: 'news', layer: article.layer || 'news', title: article.title, summary: article.summary,
    url: article.url, source: article.source, publishedAt: article.publishedAt, retrievedAt: world.retrievedAt,
    provider: article.layer && article.layer !== 'news' ? article.source : 'World Monitor', relevance: 'Baseline labels are evaluation metadata, not source evidence.',
    entityIds: targets.filter(target => matchesNewsTarget(article, target)).map(target => target.id),
    ...(article.location ? { geo: { coordinates: article.location, label: article.locationName || 'Source location', basis: article.layer && article.layer !== 'news' ? 'event-location' as const : 'article-location' as const } } : {}),
  }));
  const joined = mergeContextItems([...market.items, ...worldItems]);
  const documents: IngestionContextDocument[] = joined.map(item => ({
    id: item.id, kind: item.layer && item.layer !== 'news' ? 'world-sensor' : 'news', source: item.source,
    text: [item.title, item.summary].filter(Boolean).join('\n\n'), sourceUrl: item.url, publishedAt: item.publishedAt,
    targetNames: targets.filter(target => item.entityIds.includes(target.id)).map(target => target.name),
    metadata: { provider: item.provider, layer: item.layer || 'news', retrievedAt: item.retrievedAt, geo: item.geo,
      baselineTargetIds: item.entityIds, baselineIsGroundTruth: false, contentExtent: item.summary ? 'headline-and-supplied-summary' : 'headline-only' },
  }));
  for (const quote of world.quotes || []) documents.push({ id: `market:${quote.symbol}`, kind: 'market-observation', source: quote.source, text: json(quote), sourceUrl: quote.url, publishedAt: quote.asOf, metadata: { structured: true, clientSpecific: false } });
  for (const point of world.chokepoints || []) documents.push({ id: `chokepoint:${point.id}`, kind: 'shipping-reference', source: 'World Monitor shipping chokepoints', text: json(point), sourceUrl: point.url, publishedAt: point.asOf, metadata: { structured: true, status: point.status, clientSpecific: false } });
  const checked = new Set(market.checkedIds || []);
  const coverage = {
    capturedAt, completedAt: new Date().toISOString(), clients: dataset.clients.length, scopes: scopes.length,
    uniqueTargets: targets.length, checkedTargets: checked.size, uncheckedTargetIds: targets.filter(t => !checked.has(t.id)).map(t => t.id),
    datasetFundSnapshots: dataset.reference.FundHoldings?.length || 0,
    worldArticles: world.articles.length, worldSignals: world.signals?.length || 0, marketNews: market.items.length,
    documents: documents.length, newsDocuments: documents.filter(d => d.kind === 'news').length, researchDocuments: 0,
    worldApiAvailable: worldCheck.status === 'fulfilled' && Array.isArray((worldCheck.value as WorldDigest)?.articles), clientNewsApiAvailable: marketAvailable,
    worldCoverage: world.state, worldLayers: world.layers || [], warnings: [...new Set(warnings)],
    corpusSha256: createHash('sha256').update(json(documents)).digest('hex'),
  };
  await Promise.all([
    writeFile(artifacts.raw, json({ capturedAt, sourceFormat: 'Full normalized Compass API records, not original publisher article bodies.', targets, scopes, world, market, research: { count: 0, status: 'No supplied file; browser-only library not captured.' } })),
    writeFile(artifacts.documents, json(documents)), writeFile(artifacts.coverage, json(coverage)),
  ]);
  console.log(`[context capture] Frozen ${documents.length} documents, ${coverage.newsDocuments} news records; ${checked.size}/${targets.length} searches returned.`);
  return { documents, targets, warnings: [...new Set(warnings)], coverage, artifacts };
}
