import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { analyze } from '../src/lib/analysis.ts';
import { parseDatasetUpload } from '../src/lib/import.ts';
import { briefingCandidates, instrumentId, newsTargets, validateSelection } from '../src/lib/briefing.ts';
import { buildNetwork } from '../src/lib/network.ts';
import { createGraphLayout } from '../src/network/graph-layout.js';
import type { Dataset } from '../src/lib/types.ts';

const dataset: Dataset = JSON.parse(await readFile('public/data/case-data.json', 'utf8'));
const report: any[] = [];
for (const ref of ['CASE-012', 'CASE-002', 'CASE-038']) {
  const original = structuredClone(dataset.clients.find(c => c.ClientRef === ref)!);
  original.ClientId += 9000000; original.ClientRef = `UNSEEN-${ref}`;
  for (const cache of ['refresh', 'warm']) {
    const start = performance.now();
    const imported = parseDatasetUpload(JSON.stringify([original]), dataset.reference);
    const a = analyze({ ...dataset, ...imported }, imported.clients[0]);
    const factsMs = performance.now() - start;
    const market = await fetch('http://127.0.0.1:5173/api/market-context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: newsTargets(a), sectors: [...a.holdings.map(h => h.sector), ...a.fundSectors.map(s => s.label)], refresh: cache === 'refresh' }) }).then(r => { if (!r.ok) throw new Error(`Context HTTP ${r.status}`); return r.json(); });
    const candidates = briefingCandidates(a, market);
    const brief = await fetch('http://127.0.0.1:5173/api/briefing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidates }) }).then(r => { if (!r.ok) throw new Error(`Brief HTTP ${r.status}`); return r.json(); });
    validateSelection(brief.selection, candidates);
    const briefingMs = performance.now() - start;
    const graphStart = performance.now();
    const network = buildNetwork(a, new Set(a.holdings.filter(h => h.fundHoldings).slice(0, 2).map(h => instrumentId(h.isin, h.id))), market);
    const layout = createGraphLayout(network.nodes, network.edges); layout.simulation.stop();
    const result = { ref, cache, factsMs: Math.round(factsMs), briefingMs: Math.round(briefingMs), graphLayoutMs: Math.round(performance.now() - graphStart), totalMs: Math.round(performance.now() - start), news: market.items.filter((i: any) => i.kind === 'news').length, completedSearches: market.checked, mode: brief.mode, nodes: network.nodes.length, fundsWithSnapshots: a.holdings.filter(h => h.fundHoldings).length, fundsInScope: a.holdings.filter(h => h.instrumentType === 'Investment fund').length };
    report.push(result); console.log(JSON.stringify(result));
  }
}
await mkdir('test-results', { recursive: true });
await writeFile('test-results/briefing-benchmark.json', JSON.stringify({ at: new Date().toISOString(), caveat: 'Prepared reference and dated fund snapshots already loaded. Fresh news requests vs in-process cache. Structured mode, no AI key. Node layout benchmark excludes browser rendering. Not a cold fund-universe enrichment benchmark or SLA.', results: report }, null, 2));
