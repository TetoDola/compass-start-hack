import { materialEvent } from '../src/lib/events.ts';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import type { NewsTarget, ContextItem, MarketContext } from '../src/lib/briefing.ts';
import { fmpGet, resolveFmpSymbol, type ProviderConfig } from './providers.ts';

const id = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
export function safeUrl(value: unknown): string | undefined { try { const u = new URL(String(value)); return ['http:', 'https:'].includes(u.protocol) ? u.href : undefined; } catch { return undefined; } }
export function companyQuery(name: string) { return name.replace(/\b(?:registered|shares|ordinary|class [abc]|incorporated|inc|corp|corporation|plc|ltd|limited|ag|sa)\b\.?/gi, '').replace(/[-,()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90); }
function relevance(target: NewsTarget) { if (target.kind && target.kind !== 'company') return `Matches ${target.name} ${target.kind} exposure. Topic relevance is inferred; portfolio impact is unverified.`; const direct = target.via.includes('Direct position'), indirect = target.via !== 'Direct position'; return `Matches ${target.name}; ${direct && indirect ? 'held directly and through covered funds' : direct ? 'held directly' : 'present in the fund look-through'}. Potential relevance; impact is unverified.`; }
export function headlinePriority(title: string) {
  return (materialEvent(title)?.severity === 'critical' ? 100 : materialEvent(title) ? 40 : 0) + (/earnings|results|guidance|regulat|approval|trial|acquisition|merger|recall|lawsuit|antitrust|supply|demand|dividend/i.test(title) ? 2 : 0) - (/jaw.dropping|stunning|buy point|breakout watch|stock heads|modest gain|moderate buy|price target|dividend credits|stock units|director.*(?:buy|sell|award)/i.test(title) ? 3 : 0);
}
function newsItem(title: string, url: string, date: string, source: string, provider: string, target: NewsTarget, days = 30): ContextItem | null {
  const stamp = Date.parse(date), query = companyQuery(target.name);
  // Public feed matching is lexical relevance, never an identity/causality assertion.
  if (!safeUrl(url) || !Number.isFinite(stamp) || stamp > Date.now() + 3600000 || stamp < Date.now() - days * 86400000 || !title || title.length > 350) return null;
  if (provider === 'Google News RSS' && (query.length < 3 || !query.toLowerCase().split(' ').filter(s => s.length > 2).some(s => title.toLowerCase().includes(s)))) return null;
  if ((target.kind === 'country' || target.kind === 'region') && !/inflation|interest rate|central bank|economy|economic|gdp|tariff|sanction|recession|exports|currency|fiscal|bond|debt|equities|stock market|trade war|monetary/i.test(title)) return null;
  return { id: `news:${id(url)}`, kind: 'news', title, url, source, provider, publishedAt: new Date(stamp).toISOString(), retrievedAt: new Date().toISOString(), entityIds: [target.id], relevance: relevance(target), event: materialEvent(title) };
}
export function parseNewsRss(xml: string, target: NewsTarget, days = 30): ContextItem[] {
  const $ = load(xml, { xmlMode: true });
  if (!$('rss').length) throw new Error('The news feed was unavailable.');
  const items = $('item').toArray().map(row => {
    const source = $(row).find('source').text();
    const title = $(row).find('title').text().replace(new RegExp(` - ${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
    return newsItem(title, $(row).find('link').text(), $(row).find('pubDate').text(), source || 'News publisher', 'Google News RSS', target, days);
  }).filter((n): n is ContextItem => !!n).sort((a, b) => headlinePriority(b.title) - headlinePriority(a.title) || b.publishedAt.localeCompare(a.publishedAt));
  return [...new Map(items.map(item => [item.title.toLowerCase().replace(/\W/g, ''), item])).values()].slice(0, 2);
}
export function researchSample(targets: NewsTarget[], sectors: string[]): ContextItem[] {
  if (!sectors.some(s => /technology|information tech/i.test(s))) return [];
  return [{ id: 'house:ubs-2026-09-03', kind: 'house-view', title: 'Look beyond tech as AI strength persists', source: 'UBS CIO · public research sample', url: 'https://www.ubs.com/global/en/wealthmanagement/insights/chief-investment-office/house-view/daily/2026/latest-03092026.html', publishedAt: '2026-09-03', retrievedAt: '2026-09-18', entityIds: ['sector:Information Technology'], relevance: 'Technology exposure is present in the supplied classifications. Discuss diversification; this is not a trade signal.', sample: true, provider: 'Dated public research sample' }];
}
export function createContextResolver(config: ProviderConfig) {
  // Explicit provider-specific mappings; never infer a ticker from a display name.
  let configuredSymbols: Record<string, string> = {};
  try { const value = JSON.parse(config.OPENBB_SYMBOLS || '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) configuredSymbols = Object.fromEntries(Object.entries(value).filter(([isin, symbol]) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin) && typeof symbol === 'string' && /^[A-Za-z0-9.^=-]{1,32}$/.test(symbol))) as Record<string, string>; } catch { /* Invalid maps leave public-name lookup available. */ }
  const cache = new Map<string, { at: number; items: ContextItem[] }>();
  const pending = new Map<string, Promise<ContextItem[]>>();
  async function lookup(target: NewsTarget, refresh: boolean, days: number) {
    const key = `${target.kind || 'company'}:${target.isin || target.name}:${target.symbol || ''}:${days}`;
    const saved = cache.get(key);
    const rebind = (items: ContextItem[]) => items.map(item => ({ ...item, entityIds: [target.id], relevance: relevance(target) }));
    if (!refresh && saved && Date.now() - saved.at < 15 * 60000) return rebind(saved.items);
    let job = pending.get(key);
    if (!job) {
      job = (async () => {
        let symbol = target.symbol || (target.isin ? configuredSymbols[target.isin] : undefined);
        if (!symbol && target.isin && config.FMP_API_KEY) try { symbol = await resolveFmpSymbol(target.isin, config.FMP_API_KEY); } catch { /* RSS supports verified names without guessed tickers. */ }
        if ((!target.kind || target.kind === 'company') && symbol && config.OPENBB_BASE_URL) try {
          const u = new URL('news/company', config.OPENBB_BASE_URL.replace(/\/?$/, '/'));
          u.search = new URLSearchParams({ symbol, provider: config.OPENBB_NEWS_PROVIDER || 'yfinance', limit: '10' }).toString();
          const response = await fetch(u, { signal: AbortSignal.timeout(3500) });
          if (!response.ok) throw new Error('OpenBB unavailable');
          const data = await response.json();
          const items = (Array.isArray(data.results) ? data.results : []).map((r: any) => newsItem(r.title, r.url, r.date, r.source || r.author || 'OpenBB provider', `OpenBB / ${config.OPENBB_NEWS_PROVIDER || 'yfinance'}`, target, days)).filter(Boolean).sort((a: ContextItem,b: ContextItem) => headlinePriority(b.title)-headlinePriority(a.title)).slice(0, 2);
          if (items.length) return items as ContextItem[];
        } catch { /* Continue to another source. */ }
        if ((!target.kind || target.kind === 'company') && symbol && config.FMP_API_KEY) try {
          const rows = await fmpGet('news/stock', { symbols: symbol, limit: '10' }, config.FMP_API_KEY);
          const items = rows.filter(r => r.symbol === symbol).map(r => newsItem(r.title, r.url, r.publishedDate, r.publisher || r.site || 'FMP publisher', 'FMP', target, days)).filter((n): n is ContextItem => !!n).sort((a,b) => headlinePriority(b.title)-headlinePriority(a.title)).slice(0, 2);
          if (items.length) return items;
        } catch { /* Continue to the public feed. */ }
        const query = companyQuery(target.name);
        if (query.length < 3) return [];
        const url = new URL('https://news.google.com/rss/search');
        url.search = new URLSearchParams({ q: `"${query}" ${target.kind === "country" || target.kind === "region" ? "economy markets" : target.kind === "industry" ? "industry" : "stock"} when:${days}d`, hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
        const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
        if (!response.ok) throw new Error('Public news feed unavailable.');
        return parseNewsRss(await response.text(), target, days);
      })();
      pending.set(key, job);
      job.then(items => { if (cache.size > 500) cache.delete(cache.keys().next().value!); cache.set(key, { at: Date.now(), items }); pending.delete(key); }, () => pending.delete(key));
    }
    return rebind(await job);
  }
  return async (targets: NewsTarget[], sectors: string[], refresh = false, days = 30): Promise<MarketContext> => {
    const started = performance.now();
    const chosen = targets.slice(0, 12);
    const results = await Promise.allSettled(chosen.map(t => lookup(t, refresh, days)));
    const news = new Map<string, ContextItem>();
    let checked = 0;
    for (const result of results) if (result.status === 'fulfilled') { checked++; for (const item of result.value) { const key = item.title.toLowerCase().replace(/\W/g, ''); const old = news.get(key); if (old) { old.entityIds = [...new Set([...old.entityIds, ...item.entityIds])]; if (old.relevance !== item.relevance) old.relevance = [...new Set([old.relevance, item.relevance])].join(' '); } else news.set(key, item); } }
    const items = [...[...news.values()].sort((a,b) => headlinePriority(b.title)-headlinePriority(a.title)), ...researchSample(chosen, sectors).filter(i => Date.parse(i.publishedAt) >= Date.now() - days * 86400000)];
    const warnings = ['News uses current dates; case export dates are shifted. Headlines do not explain historical portfolio movement.', 'No bank-approved house view supplied. Public research is a labeled sample.', 'At most two ranked headlines are returned per exposure. Search completion is not exhaustive event coverage or a complete news archive.'];
    if (checked < chosen.length) warnings.push(`${chosen.length - checked} exposure searches were unavailable. Other results remain usable.`);
    if (config.OPENBB_BASE_URL && !items.some(i => i.provider.startsWith('OpenBB'))) warnings.push('No OpenBB news returned. A verified ticker and a working provider are required; available public feeds were used.');
    if (config.FMP_API_KEY && !items.some(i => i.provider === 'FMP')) warnings.push('No FMP news returned; available public feeds were used.');
    return { items, checkedIds: chosen.filter((_,i) => results[i].status === "fulfilled").map(t => t.id), windowDays: days, checked, requested: chosen.length, totalEligible: targets.length, warnings, elapsedMs: Math.round(performance.now() - started), fetchedAt: new Date().toISOString(), providers: [...new Set(items.map(i => i.provider))] };
  };
}
