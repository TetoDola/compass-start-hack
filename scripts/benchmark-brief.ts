import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { analyze } from '../src/lib/analysis.ts';
import { parseDatasetUpload } from '../src/lib/import.ts';
import { briefingCandidates, defaultSelection, instrumentId, newsTargets, validateSelection } from '../src/lib/briefing.ts';
import { loadMarketContext } from '../src/lib/loadContext.ts';
import { buildNetwork } from '../src/lib/network.ts';
import { createGraphLayout } from '../src/network/graph-layout.js';
import type { Dataset } from '../src/lib/types.ts';

const dataset:Dataset=JSON.parse(await readFile('public/data/case-data.json','utf8'));
const base='http://127.0.0.1:5173', coldFunds=process.argv.includes('--cold-funds'),report:any[]=[];
for(const ref of ['CASE-005','CASE-012','CASE-038']) {
  const original=structuredClone(dataset.clients.find(c=>c.ClientRef===ref)!);
  original.ClientId+=9000000;original.ClientRef=`UNSEEN-${ref}`;
  const start=performance.now(),imported=parseDatasetUpload(JSON.stringify([original]),structuredClone(dataset.reference));
  if(coldFunds)imported.reference.FundHoldings=[];
  const work={...dataset,...imported};let a=analyze(work,imported.clients[0]);
  validateSelection(defaultSelection(briefingCandidates(a)),briefingCandidates(a));
  const factsMs=performance.now()-start;
  const queue=[...new Set(a.holdings.filter(h=>h.instrumentType==='Investment fund'&&/shares|equit/i.test(h.asset)&&h.isin&&!h.fundHoldings).map(h=>h.isin!))];
  const attemptedFunds=queue.length;
  async function worker(){for(let isin=queue.shift();isin;isin=queue.shift())try{const r=await fetch(`${base}/api/fund-holdings?isin=${isin}${coldFunds?'&refresh=true':''}`,{signal:AbortSignal.timeout(12000)});const d=await r.json();if(r.ok&&d.snapshot)work.reference.FundHoldings=[...(work.reference.FundHoldings||[]).filter(s=>s.isin!==isin),d.snapshot];}catch{/* Missing holdings remain explicitly unknown. */}}
  await Promise.all(Array.from({length:Math.min(4,queue.length)},worker));
  a=analyze(work,imported.clients[0]);const fundsMs=performance.now()-start;
  const market=await loadMarketContext(newsTargets(a),{base,refresh:true,signal:AbortSignal.timeout(90000)});
  const newsMs=performance.now()-start,candidates=briefingCandidates(a,market),baseline=defaultSelection(candidates);
  const response=await fetch(`${base}/api/briefing`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),body:JSON.stringify({candidates})});
  if(!response.ok)throw new Error(`Brief HTTP ${response.status}`);
  const brief=await response.json();validateSelection(brief.selection,candidates);
  const briefingMs=performance.now()-start,graphStart=performance.now();
  const network=buildNetwork(a,new Set(a.holdings.filter(h=>h.fundHoldings).slice(0,2).map(h=>instrumentId(h.isin,h.id))),market);
  const layout=createGraphLayout(network.nodes,network.edges);layout.simulation.stop();
  const result={ref,renamedClientId:original.ClientId,scopeAmbiguous:a.scopeAmbiguous,coldFunds,factsMs:Math.round(factsMs),fundsStageMs:Math.round(fundsMs-factsMs),newsStageMs:Math.round(newsMs-fundsMs),aiStageMs:Math.round(briefingMs-newsMs),briefingMs:Math.round(briefingMs),graphLayoutMs:Math.round(performance.now()-graphStart),attemptedFunds,fundsWithSnapshots:a.holdings.filter(h=>h.fundHoldings).length,news:market.items.length,checked:market.checked,requested:market.requested,mode:brief.mode,message:brief.message,baseline,selected:brief.selection,brief:Object.values(brief.selection as Record<string,string[]>).flat().map(id=>candidates.find(c=>c.id===id)?.text)};
  report.push(result);console.log(JSON.stringify(result));
}
await mkdir('test-results',{recursive:true});
await writeFile('test-results/briefing-benchmark.json',JSON.stringify({at:new Date().toISOString(),caveat:'Renamed unseen client IDs, no case-specific logic. Same two-batch news loader as UI. Cold-funds mode removes snapshots in benchmark memory and requests provider refresh; no original data is deleted. Reference data already loaded. Timings exclude browser rendering and are measurements, not an SLA.',results:report},null,2));
