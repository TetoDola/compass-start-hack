import type { MarketContext, NewsTarget } from './briefing';
import { enrichRelevance } from './research';

// Two batches at a time; partial results remain useful if any provider fails.
export async function loadMarketContext(targets:NewsTarget[],{days=30,refresh=false,signal,onProgress,base=''}:{days?:number;refresh?:boolean;signal:AbortSignal;onProgress?:(context:MarketContext,processed:number)=>void;base?:string}) {
  const started=performance.now();
  let next=0,processed=0;
  let context:MarketContext={items:[],checked:0,requested:targets.length,totalEligible:targets.length,checkedIds:[],warnings:[],elapsedMs:0,fetchedAt:new Date().toISOString(),providers:[],windowDays:days};
  async function worker() {
    while(next<targets.length&&!signal.aborted) {
      const batchTargets=targets.slice(next,next+12);next+=12;
      try {
        const response=await fetch(`${base}/api/market-context`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]),body:JSON.stringify({targets:batchTargets,refresh,days})});
        if(!response.ok)throw new Error('Context unavailable');
        const batch:MarketContext=await response.json();
        const items=new Map(context.items.map(i=>[i.id,i]));
        for(const item of batch.items){const old=items.get(item.id);items.set(item.id,old?{...item,entityIds:[...new Set([...old.entityIds,...item.entityIds])],relevance:[...new Set([old.relevance,item.relevance])].join(' ')}:item);}
        context={...context,items:[...items.values()],checked:context.checked+batch.checked,checkedIds:[...new Set([...(context.checkedIds||[]),...(batch.checkedIds||[])])],warnings:[...new Set([...context.warnings,...batch.warnings])],providers:[...new Set([...context.providers,...batch.providers])]};
      }catch{if(signal.aborted)throw new Error('Context request cancelled');context={...context,warnings:[...new Set([...context.warnings,'Some news searches failed. An empty result does not establish that an exposure is safe.'])]};}
      processed+=batchTargets.length;
      context.elapsedMs=Math.round(performance.now()-started);
      if(!signal.aborted)onProgress?.(enrichRelevance(context,targets),processed);
    }
  }
  await Promise.all([worker(),worker()]);
  if(signal.aborted)throw new Error('Context request cancelled');
  return enrichRelevance(context,targets);
}
