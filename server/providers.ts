import type { FundHoldingSnapshot } from '../src/lib/types.ts';

export interface ProviderConfig {
  WORLDMONITOR_BASE_URL?: string;
  WORLDMONITOR_API_KEY?: string;
  FMP_API_KEY?: string;
  OPENBB_BASE_URL?: string;
  OPENBB_NEWS_PROVIDER?: string;
  OPENBB_SYMBOLS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_DEPLOYMENT?: string;
  FIREWORKS_API_KEY?: string;
  FIREWORKS_BASE_URL?: string;
  FIREWORKS_MODEL?: string;
  AI_PROVIDER?: string;
  CODEX_MODEL?: string;
  CODEX_BIN?: string;
}
export const validIsin = (s: unknown): s is string => typeof s === 'string' && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s);
export async function fmpGet(route: string, params: Record<string, string>, key: string, signal = AbortSignal.timeout(3000)) {
  const url = new URL(`https://financialmodelingprep.com/stable/${route}`);
  for (const [k, v] of Object.entries({ ...params, apikey: key })) url.searchParams.set(k, v);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`FMP returned ${response.status}; verify endpoint access.`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('FMP did not return a data list.');
  return data as Record<string, any>[];
}
const symbols = new Map<string, { symbol: string; at: number }>();
export async function resolveFmpSymbol(isin: string, key: string, signal?: AbortSignal) {
  if (!validIsin(isin)) throw new Error('An exact ISIN is required.');
  const old = symbols.get(isin); if (old && Date.now() - old.at < 86400000) return old.symbol;
  const rows = await fmpGet('search-isin', { isin }, key, signal);
  const row = rows.find(r => r.isin === isin && typeof r.symbol === 'string' && /^[A-Za-z0-9.^=-]{1,32}$/.test(r.symbol));
  if (!row) throw new Error('FMP could not verify a ticker for this ISIN.');
  symbols.set(isin, { symbol: row.symbol, at: Date.now() });
  return row.symbol as string;
}
export function parseFmpHoldings(rows: Record<string, any>[], isin: string, symbol: string): FundHoldingSnapshot {
  if (!rows.length || rows.some(r => r.symbol !== symbol || !Number.isFinite(r.weightPercentage) || r.weightPercentage < 0 || r.weightPercentage > 100)) throw new Error('Invalid or mismatched FMP holdings.');
  const sorted = [...rows].sort((a, b) => b.weightPercentage - a.weightPercentage).slice(0, 10);
  const dates = sorted.map(r => typeof r.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.updatedAt) ? r.updatedAt.slice(0, 10) : '');
  if (dates.some(d => !d || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) || new Set(dates).size !== 1) throw new Error('FMP holdings lack a consistent update date.');
  const holdings = sorted.map(r => ({ name: String(r.name || r.asset || '').trim(), weight: r.weightPercentage / 100, ...(validIsin(r.isin) ? { isin: r.isin } : {}) }));
  if (holdings.some(h => !h.name) || holdings.reduce((sum, h) => sum + h.weight, 0) > 1.001) throw new Error('Invalid FMP top-ten total.');
  return { isin, name: symbol, asOf: dates[0], retrievedAt: new Date().toISOString(), sourceName: 'FMP · holdings update date', sourceUrl: `https://financialmodelingprep.com/stable/etf/holdings?symbol=${encodeURIComponent(symbol)}`, coverage: 'top-holdings', holdings };
}
export async function fmpHoldings(isin: string, key: string) {
  const signal = AbortSignal.timeout(3500);
  const symbol = await resolveFmpSymbol(isin, key, signal);
  return parseFmpHoldings(await fmpGet('etf/holdings', { symbol }, key, signal), isin, symbol);
}
