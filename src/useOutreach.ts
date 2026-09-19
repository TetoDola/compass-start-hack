import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from './lib/types';
import type { ContextItem, MarketContext } from './lib/briefing';
import type { WorldDigest } from './lib/world';
import { worldContext } from './lib/world';
import { loadMarketContext } from './lib/loadContext';
import { buildOutreachBook, buildDevelopments, candidateTargets, normalizeArticles, ruleClassification, type ClassifiedArticle, type Classification } from './lib/outreach';

interface Scan {
  key: string; rows: ClassifiedArticle[]; phase: string; articles: number; screened: number;
  checked: number; warnings: string[]; completedAt?: string;
}
const empty: Scan = { key: '', rows: [], phase: '', articles: 0, screened: 0, checked: 0, warnings: [] };

export function useOutreach(dataset: Dataset, active: boolean) {
  const book = useMemo(() => buildOutreachBook(dataset), [dataset]);
  // Client data stays local. A changed import/reference snapshot invalidates the book immediately.
  const key = useMemo(() => JSON.stringify([dataset.version, book]), [dataset.version, book]);
  const [scan, setScan] = useState<Scan>(empty);
  const [now, setNow] = useState(Date.now());
  const controller = useRef<AbortController | null>(null);
  const startedKey = useRef('');
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, [active]);
  const refresh = useCallback(async (force = true) => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort; startedKey.current = key;
    const signal = abort.signal;
    let current: Scan = { ...empty, key, phase: 'Scanning all clients and public news from the past 7 days…' };
    const publish = (patch: Partial<Scan>) => { current = { ...current, ...patch }; if (!signal.aborted) setScan(current); };
    publish({}); setNow(Date.now());
    let marketItems: ContextItem[] = [], worldItems: ContextItem[] = [];
    const interim = () => {
      const articles = normalizeArticles([...marketItems, ...worldItems]);
      const rows = articles.map(article => ({ article, targets: candidateTargets(article, book.targets) })).filter(i => i.targets.length).map(input => ({ article: input.article, classification: ruleClassification(input) }));
      publish({ rows, articles: articles.length });
    };
    const warnings = new Set<string>();
    const market = loadMarketContext(book.targets, { days: 7, refresh: force, signal, onProgress: (partial, processed) => {
      marketItems = partial.items; partial.warnings.forEach(w => warnings.add(w));
      publish({ checked: partial.checked, warnings: [...warnings], phase: `Checking public news · ${processed}/${book.targets.length} unique exposures…` }); interim();
    } }).then(result => { marketItems = result.items; result.warnings.forEach(w => warnings.add(w)); publish({ checked: result.checked }); }).catch(() => { if (!signal.aborted) warnings.add('Some portfolio-news searches failed.'); });
    const world = fetch('/api/world-context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: force }), signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) }).then(async response => {
      if (!response.ok) throw new Error();
      const digest: WorldDigest = await response.json();
      const context: MarketContext = worldContext(digest, book.targets, 7);
      worldItems = context.world?.globalItems || context.items;
      if (digest.state !== 'complete') warnings.add(digest.message);
      for (const layer of digest.layers || []) if (layer.state !== 'available') warnings.add(`${layer.label}: ${layer.state}`);
      interim();
    }).catch(() => { if (!signal.aborted) warnings.add('World data unavailable; portfolio news remains usable.'); });
    await Promise.all([market, world]);
    if (signal.aborted) return;
    const articles = normalizeArticles([...marketItems, ...worldItems]);
    const inputs = articles.map(article => ({ article, targets: candidateTargets(article, book.targets) })).filter(i => i.targets.length);
    let rows: ClassifiedArticle[] = inputs.map(input => ({ article: input.article, classification: ruleClassification(input) }));
    let next = 0, done = 0;
    publish({ rows, articles: articles.length, warnings: [...warnings], phase: `Classifying ${inputs.length} relevant articles…` });
    async function worker() {
      while (next < inputs.length && !signal.aborted) {
        const start = next; next += 6; const batch = inputs.slice(start, start + 6);
        try {
          const response = await fetch('/api/outreach-classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([signal, AbortSignal.timeout(50000)]), body: JSON.stringify({ articles: batch }) });
          if (!response.ok) throw new Error();
          const result: { results: Classification[] } = await response.json();
          if (!Array.isArray(result.results) || result.results.length !== batch.length) throw new Error();
          rows = rows.map((row, index) => index >= start && index < start + batch.length ? { ...row, classification: result.results[index - start] } : row);
        } catch { if (signal.aborted) return; warnings.add('Some classifications are unavailable. Conservative rule-based results are capped at 6/10.'); }
        done += batch.length;
        publish({ rows: [...rows], screened: done, warnings: [...warnings], phase: `Classifying news · ${done}/${inputs.length} relevant articles…` });
      }
    }
    await Promise.all([worker(), worker()]);
    if (signal.aborted) return;
    if (rows.some(r => r.classification.mode === 'rules')) warnings.add('Some articles use conservative rules because MiniMax is unconfigured, unavailable, or its output did not pass validation.');
    publish({ rows, warnings: [...warnings], phase: '', completedAt: new Date().toISOString() });
  }, [key, book]);
  useEffect(() => {
    if (active && startedKey.current !== key) void refresh(false);
  }, [active, key, refresh]);
  useEffect(() => () => { controller.current?.abort(); startedKey.current = ''; }, [key]);
  const current = scan.key === key ? scan : { ...empty, phase: active ? 'Preparing the updated client book…' : '' };
  const developments = useMemo(() => buildDevelopments(current.rows, book.scopes, now), [current.rows, book.scopes, now]);
  return { ...current, book, developments, refresh, now };
}
