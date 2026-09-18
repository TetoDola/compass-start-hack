import { readFile, writeFile } from 'node:fs/promises';
import { createFundResolver } from '../server/fund-holdings';

const started = performance.now();
const dataset = JSON.parse(await readFile('public/data/case-data.json', 'utf8'));
const ids = new Set(dataset.clients.flatMap((c: any) => c.Portfolios.flatMap((p: any) => p.SecurityPositions.map((h: any) => h.SecurityId))));
const allReference = process.argv.includes('--all');
const isins = [...new Set<string>(dataset.reference.Securities.filter((s: any) => s.SecurityTypeName === 'Investment fund' && s.Isin && (allReference || ids.has(s.Id))).map((s: any) => s.Isin))];
const queue = [...isins];
const resolve = createFundResolver();
const results: { isin: string; status: string; elapsedMs: number; message?: string }[] = [];
const worker = async () => {
  for (let isin = queue.shift(); isin; isin = queue.shift()) {
    const start = performance.now();
    try { const result = await resolve(isin); results.push({ isin, status: result.cached ? 'cached' : 'fetched', elapsedMs: Math.round(performance.now() - start) }); }
    catch (error) { results.push({ isin, status: 'unavailable', elapsedMs: Math.round(performance.now() - start), message: error instanceof Error ? error.message : String(error) }); }
    if (results.length % 20 === 0) console.log(`${results.length}/${isins.length} resolved; ${results.filter(r => r.status !== 'unavailable').length} available`);
  }
};
await Promise.all(Array.from({ length: 4 }, worker));
const available = results.filter(r => r.status !== 'unavailable').length;
const report = { attempted: isins.length, available, unavailable: isins.length - available, elapsedMs: Math.round(performance.now() - started), results };
await writeFile('.cache/fund-warm-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ attempted: report.attempted, available, unavailable: report.unavailable, elapsedMs: report.elapsedMs }));
