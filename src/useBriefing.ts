import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimeRange } from './lib/portfolio';
import type { Analysis } from './lib/types';
import { briefingCandidates, defaultSelection, newsTargets, validateSelection, type BriefResult, type MarketContext } from './lib/briefing';

export function useBriefing(analysis: Analysis | null) {
  const [newsRange, setNewsRange] = useState<TimeRange>('1M');
  // Re-enrich automatically when a newly resolved fund changes the covered news universe.
  const key = analysis ? JSON.stringify([analysis.customer, analysis.scope, newsRange, newsTargets(analysis).map(t => [t.id, t.name, t.via])]) : '';
  const latest = useRef(analysis); latest.current = analysis;
  const [state, setState] = useState<{ key: string; context?: MarketContext; result?: BriefResult; phase: string; elapsedMs?: number }>({ key: '', phase: '' });
  const controller = useRef<AbortController | null>(null);
  const valid = state.key === key;
  const context = valid ? state.context : undefined;
  const candidates = useMemo(() => analysis ? briefingCandidates(analysis, context) : [], [analysis, context]);
  const refresh = useCallback(async (force = true) => {
    const a = latest.current; if (!a) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const started = performance.now();
    setState({ key, phase: 'Screening news across covered holdings and exposures…' });
    const targets = newsTargets(a);
    let context: MarketContext = { items: [], checked: 0, requested: targets.length, totalEligible: targets.length, checkedIds: [], warnings: [], elapsedMs: 0, fetchedAt: new Date().toISOString(), providers: [] };
    const days = { '1D': 1, '7D': 7, '1M': 30, '1Y': 365 }[newsRange];
    for (let offset = 0; offset < targets.length; offset += 12) {
      if (abort.signal.aborted) return;
      try {
        const sectors = [...new Set([...a.holdings.map(h => h.sector), ...a.fundSectors.map(s => s.label)])];
        const response = await fetch('/api/market-context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]), body: JSON.stringify({ targets: targets.slice(offset, offset+12), sectors: offset === 0 ? sectors : [], refresh: force, days }) });
        if (!response.ok) throw new Error('News lookup unavailable');
        const batch: MarketContext = await response.json();
        const merged = new Map(context.items.map(i => [i.id,i]));
        for (const item of batch.items) { const old = merged.get(item.id); merged.set(item.id, old ? { ...item, entityIds: [...new Set([...old.entityIds, ...item.entityIds])], relevance: [...new Set([old.relevance,item.relevance])].join(' ') } : item); }
        context = { ...context, items: [...merged.values()], checked: context.checked+batch.checked, checkedIds: [...(context.checkedIds || []), ...(batch.checkedIds || [])], warnings: [...new Set([...context.warnings,...batch.warnings])], providers: [...new Set([...context.providers,...batch.providers])], windowDays: days, elapsedMs: Math.round(performance.now()-started) };
      } catch {
        if (abort.signal.aborted) return;
        context = { ...context, warnings: [...new Set([...context.warnings, 'Some exposure searches were unavailable. An empty result is not evidence that a holding is safe.'])] };
      }
      if (!abort.signal.aborted) setState({ key, context, phase: `Screening company, industry and country news · ${Math.min(offset+12, targets.length)}/${targets.length} exposures processed…` });
    }
    if (abort.signal.aborted) return;
    setState({ key, context, phase: 'Preparing the four-part brief…' });
    const candidates = briefingCandidates(a, context);
    let result: BriefResult = { selection: defaultSelection(candidates), mode: 'structured', message: 'Structured brief · AI not configured', elapsedMs: 0 };
    try {
      const response = await fetch('/api/briefing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]), body: JSON.stringify({ candidates }) });
      if (!response.ok) throw new Error('Briefing service unavailable');
      result = await response.json(); validateSelection(result.selection, candidates);
    } catch { if (abort.signal.aborted) return; result.message = 'Briefing service unavailable · structured brief retained'; }
    if (!abort.signal.aborted) setState({ key, context, result, phase: '', elapsedMs: Math.round(performance.now() - started) });
  }, [key]);
  useEffect(() => { if (analysis) void refresh(false); return () => controller.current?.abort(); }, [key, refresh]);
  const result = valid ? state.result : undefined;
  // Reject stale candidate IDs after a background reference update.
  let selection = defaultSelection(candidates);
  if (result) try { selection = validateSelection(result.selection, candidates); } catch { /* Updated evidence uses the structured selection. */ }
  return { context, candidates, selection, message: result?.message || 'Structured customer facts', mode: result?.mode || 'structured', phase: valid ? state.phase : '', elapsedMs: valid ? state.elapsedMs : undefined, refresh, newsRange, setNewsRange };
}
