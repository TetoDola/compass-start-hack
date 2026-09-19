import type { EventDiscussion } from './lib/eventContext';
import { mergeWorldContext, worldContext, type WorldDigest } from './lib/world';
import { loadMarketContext } from './lib/loadContext';
import { parseResearch, researchItems, type ResearchView } from './lib/research';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimeRange } from './lib/portfolio';
import type { Analysis } from './lib/types';
import { briefingCandidates, defaultSelection, newsTargets, validateSelection, type BriefResult, type ContextItem, type MarketContext } from './lib/briefing';

export function useBriefing(analysis: Analysis | null) {
  const [research,setResearch]=useState<ResearchView[]>(()=>{try{return parseResearch(localStorage.getItem('compass-research')||'[]');}catch{return [];}});
  function importResearch(text:string){const rows=parseResearch(text);localStorage.setItem('compass-research',JSON.stringify(rows));setResearch(rows);}
  function clearResearch(){localStorage.removeItem('compass-research');setResearch([]);}
  const [pinnedEvent,setPinnedEvent]=useState<EventDiscussion>();
  const talkingPoint=pinnedEvent?.customerId===analysis?.customer.ClientId&&pinnedEvent?.scope===analysis?.scope?pinnedEvent:undefined;
  const pinEvent=(item:ContextItem)=>{if(analysis)setPinnedEvent({item,customerId:analysis.customer.ClientId,scope:analysis.scope});};
  const clearEvent=()=>setPinnedEvent(undefined);
  useEffect(()=>setPinnedEvent(undefined),[analysis?.customer.ClientId,analysis?.scope]);
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
    const days={'1D':1,'7D':7,'1M':30,'1Y':365}[newsRange];
    let worldLayer:MarketContext|undefined;
    let latestMarket:MarketContext={items:[],checked:0,requested:targets.length,warnings:[],elapsedMs:0,fetchedAt:new Date().toISOString(),providers:[]};
    let newsPhase='Screening news across covered holdings and exposures…';
    const withResearch=(context:MarketContext)=>{const merged=worldLayer?mergeWorldContext(context,worldLayer,targets):context;return {...merged,items:[...merged.items,...house]};};
    // Shared public digest: no client records or portfolio identifiers leave Compass.
    const worldPromise=fetch('/api/world-context',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(27000)])})
      .then(async response=>{if(!response.ok)throw new Error('World feed unavailable');return await response.json() as WorldDigest;})
      .catch(():WorldDigest=>({articles:[],state:'unavailable',retrievedAt:new Date().toISOString(),message:'World Monitor unavailable. Portfolio news remains available.'}))
      .then(digest=>{worldLayer=worldContext(digest,targets,days);if(!abort.signal.aborted)setState({key,context:withResearch(latestMarket),phase:newsPhase});return digest;});
    let context:MarketContext;
    try {context=withResearch(await loadMarketContext(targets,{days,refresh:force,signal:abort.signal,onProgress:(partial,processed)=>{latestMarket=partial;newsPhase=`Checking news · ${processed}/${targets.length} exposures processed…`;setState({key,context:withResearch(partial),phase:newsPhase});}}));}
    catch{if(abort.signal.aborted)return;context={items:house,checked:0,requested:targets.length,warnings:['News unavailable. Source-backed portfolio facts remain usable.'],elapsedMs:0,fetchedAt:new Date().toISOString(),providers:[]};}
    const world=await worldPromise;
    if(abort.signal.aborted)return;
    context=mergeWorldContext(context,worldContext(world,targets,days),targets);
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
  return { talkingPoint, pinEvent, clearEvent, research, importResearch, clearResearch, context, candidates, selection, message: result?.message || 'Structured customer facts', mode: result?.mode || 'structured', phase: valid ? state.phase : '', elapsedMs: valid ? state.elapsedMs : undefined, refresh, newsRange, setNewsRange };
}
