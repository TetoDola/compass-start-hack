import { loadMarketContext } from './lib/loadContext';
import { parseResearch, researchItems, type ResearchView } from './lib/research';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimeRange } from './lib/portfolio';
import type { Analysis } from './lib/types';
import { briefingCandidates, defaultSelection, newsTargets, validateSelection, type BriefResult, type MarketContext } from './lib/briefing';

export function useBriefing(analysis: Analysis | null) {
  const [research,setResearch]=useState<ResearchView[]>(()=>{try{return parseResearch(localStorage.getItem('compass-research')||'[]');}catch{return [];}});
  function importResearch(text:string){const rows=parseResearch(text);localStorage.setItem('compass-research',JSON.stringify(rows));setResearch(rows);}
  function clearResearch(){localStorage.removeItem('compass-research');setResearch([]);}
  const [newsRange, setNewsRange] = useState<TimeRange>('1M');
  // Re-enrich automatically when a newly resolved fund changes the covered news universe.
  const key = analysis ? JSON.stringify([analysis.customer, analysis.scope, newsRange, research, newsTargets(analysis).map(t => [t.id, t.name, t.via])]) : '';
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
    const house=researchItems(research,targets);
    const withResearch=(context:MarketContext)=>({...context,items:[...context.items,...house]});
    let context:MarketContext;
    try {context=withResearch(await loadMarketContext(targets,{days:{'1D':1,'7D':7,'1M':30,'1Y':365}[newsRange],refresh:force,signal:abort.signal,onProgress:(partial,processed)=>setState({key,context:withResearch(partial),phase:`Checking news · ${processed}/${targets.length} exposures processed…`})}));}
    catch{if(abort.signal.aborted)return;context={items:house,checked:0,requested:targets.length,warnings:['News unavailable. Source-backed portfolio facts remain usable.'],elapsedMs:0,fetchedAt:new Date().toISOString(),providers:[]};}
    if(abort.signal.aborted)return;
    setState({key,context,phase:'Refining the brief with AI · the sourced brief is ready below…'});
    const candidates = briefingCandidates(a, context);
    let result: BriefResult = { selection: defaultSelection(candidates), mode: 'structured', message: 'Structured brief · AI not configured', elapsedMs: 0 };
    try {
      const response = await fetch('/api/briefing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(90000)]), body: JSON.stringify({ candidates }) });
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
  return { research, importResearch, clearResearch, context, candidates, selection, message: result?.message || 'Structured customer facts', mode: result?.mode || 'structured', phase: valid ? state.phase : '', elapsedMs: valid ? state.elapsedMs : undefined, refresh, newsRange, setNewsRange };
}
