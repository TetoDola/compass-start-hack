import { load } from 'cheerio';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FundHoldingSnapshot } from '../src/lib/types.ts';
import { fmpHoldings, type ProviderConfig } from './providers.ts';

const isinPattern = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
export function parseFundPage(html: string, isin: string): FundHoldingSnapshot {
  const $ = load(html);
  const canonical = $('link[rel="canonical"]').attr('href');
  if (!canonical || new URL(canonical).searchParams.get('isin') !== isin) throw new Error('The source did not match the requested ISIN.');
  const date = $('[data-testid="tl_etf-holdings_reference-date"]').text().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!date) throw new Error('No dated holdings list was available.');
  const asOf = `${date[3]}-${date[2]}-${date[1]}`;
  if (!Number.isFinite(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0, 10) !== asOf || Date.parse(asOf) > Date.now()) throw new Error('Invalid holdings date.');
  const holdings = $('[data-testid="etf-holdings_top-holdings_row"]').toArray().slice(0, 10).map(row => {
    const name = $(row).find('td').first().text().trim().replace(/\s+/g, ' ');
    const value = $(row).find('[data-testid="tl_etf-holdings_top-holdings_value_percentage"]').text().trim();
    const weight = /^\d+(?:\.\d+)?%$/.test(value) ? Number(value.replace('%', '')) / 100 : NaN;
    const stockIsin = $(row).find('a[href*="/stock-profiles/"]').attr('href')?.split('/').at(-1);
    return { name, weight, ...(stockIsin && isinPattern.test(stockIsin) ? { isin: stockIsin } : {}) };
  });
  if (!holdings.length || holdings.some(h => !h.name || !Number.isFinite(h.weight) || h.weight < 0 || h.weight > 1) || holdings.reduce((n, h) => n + h.weight, 0) > 1.001) throw new Error('The source did not contain a valid top-holdings list.');
  const declaredText = $('[data-testid="tl_etf-holdings_top-holdings_weight"]').text().trim();
  const declared = Number(declaredText.replace('%', '')) / 100;
  if (!declaredText || !Number.isFinite(declared) || Math.abs(declared - holdings.reduce((n, h) => n + h.weight, 0)) > .002) throw new Error('The holdings did not reconcile with the published total.');
  return { isin, name: $('h1').first().text().trim(), asOf, retrievedAt: new Date().toISOString(), sourceName: 'justETF · published top holdings', sourceUrl: `https://www.justetf.com/en/etf-profile.html?isin=${isin}`, coverage: 'top-holdings', holdings };
}

export function createFundResolver(root = process.cwd(), config: ProviderConfig = {}) {
  const directory = path.join(root, '.cache/fund-holdings');
  const pending = new Map<string, Promise<FundHoldingSnapshot>>();
  const failures = new Map<string, { at: number; message: string }>();
  const checked = new Map<string, number>();
  const DAY=86400000;
  const validSnapshot=(s:FundHoldingSnapshot|undefined,isin:string):s is FundHoldingSnapshot=>!!s&&s.isin===isin&&typeof s.retrievedAt==='string'&&Number.isFinite(Date.parse(s.asOf))&&Date.parse(s.asOf)<=Date.now()&&new Date(s.asOf).toISOString().slice(0,10)===s.asOf&&Array.isArray(s.holdings)&&s.holdings.length>0&&s.holdings.every(h=>typeof h.name==='string'&&!!h.name.trim()&&Number.isFinite(h.weight)&&h.weight>=0&&h.weight<=1)&&s.holdings.reduce((n,h)=>n+h.weight,0)<=1.001;
  return async (isin: string, refresh = false): Promise<{ snapshot: FundHoldingSnapshot; cached: boolean; stale: boolean; warning?: string }> => {
    if (!isinPattern.test(isin)) throw new Error('A valid fund ISIN is required.');
    let saved: FundHoldingSnapshot | undefined, seeds:FundHoldingSnapshot[]=[];
    try { saved = JSON.parse(await readFile(path.join(directory, `${isin}.json`), 'utf8')); } catch { /* No local snapshot yet. */ }
    try { seeds = JSON.parse(await readFile(path.join(root, 'data/fund-holdings.json'), 'utf8')); } catch { /* Seeds are optional. */ }
    const seed = Array.isArray(seeds)?seeds.find(s => s.isin === isin):undefined;
    const best = [saved, seed].filter((s): s is FundHoldingSnapshot => validSnapshot(s,isin)).sort((a, b) => b.asOf.localeCompare(a.asOf)||b.retrievedAt.localeCompare(a.retrievedAt))[0];
    const result=(snapshot:FundHoldingSnapshot,cached:boolean,warning?:string)=>{
      const stale=!!warning||Date.now()-Date.parse(snapshot.asOf)>30*DAY;
      return {snapshot,cached,stale,...(warning?{warning}:stale?{warning:`Source holdings are dated ${snapshot.asOf}, over 30 days old. Holdings may have changed.`}:{})};
    };
    if (!refresh) {
      const failure = failures.get(isin);
      if (failure && Date.now() - failure.at < 60_000) {
        if(best)return result(best,true,`Refresh unavailable. Retained source holdings dated ${best.asOf}; current holdings unverified.`);
        throw new Error(failure.message);
      }
      if(best) {
        const retrieved=Date.parse(best.retrievedAt), recent=Number.isFinite(retrieved)&&retrieved<=Date.now()&&Date.now()-retrieved<DAY;
        if((recent&&Date.now()-Date.parse(best.asOf)<=30*DAY)||Date.now()-(checked.get(isin)||0)<DAY)return result(best,true);
      }
    }
    let job = pending.get(isin);
    if (!job) {
      job = (async () => {
        if (config.FMP_API_KEY) try {
          const snapshot = await fmpHoldings(isin, config.FMP_API_KEY);
          if(!validSnapshot(snapshot,isin))throw new Error('Provider holdings are not valid dated evidence.');
          await mkdir(directory, { recursive: true });
          if(!best||snapshot.asOf>=best.asOf)await writeFile(path.join(directory, `${isin}.json`), JSON.stringify(snapshot));
          failures.delete(isin);
          return snapshot;
        } catch { /* Unsupported markets and paid-tier restrictions fall back to public holdings. */ }
        const response = await fetch(`https://www.justetf.com/en/etf-profile.html?isin=${isin}`, { signal: AbortSignal.timeout(6500), headers: { Accept: 'text/html' } });
        if (!response.ok) throw new Error(`Holdings source returned ${response.status}.`);
        const snapshot = parseFundPage(await response.text(), isin);
        await mkdir(directory, { recursive: true });
        if(!best||snapshot.asOf>=best.asOf)await writeFile(path.join(directory, `${isin}.json`), JSON.stringify(snapshot));
        failures.delete(isin);
        return snapshot;
      })();
      pending.set(isin, job);
      job.then(() => pending.delete(isin), error => { pending.delete(isin); failures.set(isin, { at: Date.now(), message: error.message }); });
    }
    try {
      const snapshot=await job;
      checked.set(isin,Date.now());
      if(best&&best.asOf>snapshot.asOf)return result(best,true,`Provider returned older holdings (${snapshot.asOf}). Retained newer source holdings dated ${best.asOf}; current holdings unverified.`);
      return result(snapshot,false);
    } catch {
      if(best)return result(best,true,`Refresh unavailable. Retained source holdings dated ${best.asOf}; current holdings unverified.`);
      throw new Error('Current fund holdings could not be retrieved; no valid dated fallback is available.');
    }
  };
}

export function fundHoldingsMiddleware(root = process.cwd(), config: ProviderConfig = {}) {
  const resolve = createFundResolver(root, config);
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/api/fund-holdings') return next();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: 'GET required' })); return; }
    const started = performance.now();
    try {
      const result = await resolve(url.searchParams.get('isin') || '', url.searchParams.get('refresh') === 'true');
      res.end(JSON.stringify({ ...result, elapsedMs: Math.round(performance.now() - started) }));
    } catch (error) {
      res.statusCode = 422;
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Holdings unavailable', elapsedMs: Math.round(performance.now() - started) }));
    }
  };
}
