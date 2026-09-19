import { useMemo, useState } from 'react';
import { ArrowUpRight, BookmarkPlus, Network, RefreshCw, Search, X } from 'lucide-react';
import { WorldMap } from './WorldMap';
import type { Analysis, Evidence } from './lib/types';
import { contextEvidence, newsTargets, type ContextItem, type MarketContext } from './lib/briefing';
import { portfolioExposures, type TimeRange } from './lib/portfolio';
import { scenarioEffect, type WorldChokepoint } from './lib/world';
import { dateLabel, percent, money } from './lib/format';
import { compareNews, materialEvent } from './lib/events';
import { mandate } from './lib/advisory';
import { eventQuestion, type EventDiscussion } from './lib/eventContext';
import './world.css';

const ranges:TimeRange[]=['1D','7D','1M','1Y'];
const clock=(date:string)=>new Date(date).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const wordMatch=(title:string,name:string)=>{const terms=name.toLowerCase().replace(/\b(strait|canal|of|the)\b/g,'').trim().split(/\s+/).filter(w=>w.length>3);return terms.some(w=>title.toLowerCase().includes(w));};
export function WorldView({analysis,context,range,onRange,onEvidence,onGraph,onTrace,onAsk,onPin,onRefresh,busy}:{analysis:Analysis;context?:MarketContext;range:TimeRange;onRange:(range:TimeRange)=>void;onEvidence:(e:Evidence)=>void;onGraph:(id:string)=>void;onTrace:(item:ContextItem)=>void;onAsk:(selection:EventDiscussion)=>void;onPin:(item:ContextItem)=>void;onRefresh:()=>void;busy:boolean}) {
  // Start with the adviser’s actionable slice; Global remains one click away for context.
  const [eventId,setEventId]=useState(''),[query,setQuery]=useState(''),[relevant,setRelevant]=useState(true),[day,setDay]=useState('');
  const [layers,setLayers]=useState({news:true,shipping:true,disaster:true}),[showExposure,setShowExposure]=useState(false);
  const [chokepoint,setChokepoint]=useState<WorldChokepoint>();
  const [scenarioId,setScenarioId]=useState(''),[move,setMove]=useState(-10),[scenarioOpen,setScenarioOpen]=useState(false);
  const status=context?.world,targets=useMemo(()=>newsTargets(analysis),[analysis]);
  const allItems=useMemo(()=>{
    const all=new Map<string,ContextItem>();
    for(const item of [...status?.globalItems||[],...context?.items||[]])if(item.kind==='news'&&!item.sample)all.set(item.url,item);
    const now=Date.now(),days={'1D':1,'7D':7,'1M':30,'1Y':365}[range];
    return [...all.values()].filter(i=>Date.parse(i.publishedAt)<=now&&Date.parse(i.publishedAt)>=now-days*86400000).sort(compareNews);
  },[context,range]);
  const filtered=allItems.filter(i=>layers[i.layer||'news']&&(!relevant||i.entityIds.length)&&(!query||`${i.title} ${i.summary||''} ${i.source}`.toLowerCase().includes(query.toLowerCase())));
  const days=[...new Set(filtered.map(i=>i.publishedAt.slice(0,10)))].sort().slice(-31);
  const activeDay=days.includes(day)?day:'';
  const visible=filtered.filter(i=>!activeDay||i.publishedAt.startsWith(activeDay));
  const event=visible.find(i=>i.id===eventId)||visible[0];
  const linked=event?targets.filter(t=>event.entityIds.includes(t.id)):[];
  const companies=targets.filter(t=>(!t.kind||t.kind==='company')&&t.weight!=null&&t.weight>0&&t.weight<=1);
  const eligible=companies.filter(t=>linked.some(l=>l.id===t.id));
  // A manual scenario belongs only to the event for which it was selected.
  const scenario=event?.id===eventId?companies.find(t=>t.id===scenarioId)||eligible[0]:eligible[0];
  const effect=scenarioEffect(scenario?.weight??null,move/100);
  const exposures=portfolioExposures(analysis,'country');
  const clientNote=analysis.findings.find(f=>f.id==='customer-context');
  function select(item:ContextItem){setEventId(item.id);setChokepoint(undefined);setScenarioId('');setMove(-10);setScenarioOpen(false);}
  function discussion():EventDiscussion{return {item:event!,customerId:analysis.customer.ClientId,scope:analysis.scope,...(scenarioOpen&&scenario?{scenario:{companyId:scenario.id,move:move/100}}:{})};}
  const direct=linked.filter(t=>!t.kind||t.kind==='company');
  const relatedChokepointNews=chokepoint?allItems.filter(i=>wordMatch(i.title,chokepoint.name)).slice(0,4):[];
  return <section className="world-view" aria-label="Portfolio world intelligence">
    <div className="world-command"><div><span className="ws-kicker">WORLD INTELLIGENCE</span><h3>What’s happening. What it touches.</h3></div><div className="world-range" aria-label="Event time window">{ranges.map(r=><button key={r} aria-pressed={range===r} onClick={()=>{onRange(r);setDay('');}}>{r}</button>)}</div><button className="ws-icon" aria-label="Refresh world intelligence" disabled={busy} onClick={onRefresh}><RefreshCw size={16}/></button></div>
    <div className="world-client-scope"><strong>{analysis.customer.ClientRef}</strong><span>{analysis.scope==='all'?'All supplied portfolios':analysis.portfolios[0]?.PortfolioNr}</span><span>{mandate(analysis).label}</span><span>{analysis.weightsAvailable?`${exposures.length} classified countries`:'Exposure weights unavailable'}</span></div>
    <div className="world-market-strip" aria-label="Market observations">
      {(status?.quotes||[]).map(q=><a key={q.symbol} href={q.url} target="_blank" rel="noreferrer" title={`${q.source} · ${q.asOf?clock(q.asOf):'Observation time unavailable'} · provider session change, not portfolio return`}><span>{q.name}<small>{q.currency||''}</small></span><div><strong>{q.price.toLocaleString('en-US',{maximumFractionDigits:2})}</strong><b className={q.change==null?'':q.change>=0?'positive':'negative'}>{q.change==null?'—':`${q.change>=0?'+':''}${q.change.toFixed(2)}%`}</b></div><small>{q.asOf?clock(q.asOf):'As of unknown'} · session</small></a>)}
      {!status?.quotes?.length&&<p>{busy?'Loading dated market observations…':'Market observations unavailable.'}</p>}
    </div>
    <div className="world-filters"><div className="world-universe"><button aria-pressed={!relevant} onClick={()=>{setRelevant(false);setChokepoint(undefined);}}>Global</button><button aria-pressed={relevant} onClick={()=>{setRelevant(true);setChokepoint(undefined);}}>This client <b>{allItems.filter(i=>i.entityIds.length).length}</b></button></div><div className="world-layer-toggles">{(['news','shipping','disaster'] as const).map(layer=><label key={layer}><input type="checkbox" checked={layers[layer]} onChange={e=>{setLayers(l=>({...l,[layer]:e.target.checked}));setChokepoint(undefined);}}/><i className={`layer-${layer}`}/>{layer==='disaster'?'Natural events':layer==='shipping'?'Shipping':'News'}</label>)}<label><input type="checkbox" checked={showExposure} onChange={e=>setShowExposure(e.target.checked)}/>Exposure</label></div></div>
    <div className="world-layout">
      <div className="world-main">
        <WorldMap items={visible} selected={chokepoint?undefined:event} chokepoints={layers.shipping&&!relevant?status?.chokepoints||[]:[]} selectedChokepoint={chokepoint} exposures={exposures} showExposure={showExposure} onSelect={select} onChokepoint={c=>{setChokepoint(c);setScenarioOpen(false);setScenarioId('');}}/>
        <div className="world-timeline"><div><span>Event timeline · {range}</span><button onClick={()=>setDay('')} aria-pressed={!activeDay}>All dates</button>{activeDay&&<strong>{dateLabel(activeDay,true)}</strong>}</div><div className="world-timeline-bars">{days.map(d=>{const count=filtered.filter(i=>i.publishedAt.startsWith(d)).length,max=Math.max(...days.map(date=>filtered.filter(i=>i.publishedAt.startsWith(date)).length),1);return <button key={d} aria-label={`${d}: ${count} events`} aria-pressed={activeDay===d} title={`${d} · ${count} events`} onClick={()=>{setDay(activeDay===d?'':d);setChokepoint(undefined);}}><i style={{height:`${8+count/max*23}px`}}/><span>{d.slice(8)}</span></button>;})}</div><small>Filters available source records; not a complete historical archive.</small></div>
        <div className="world-events"><header><strong>{visible.length} events {relevant?'linked to this client':'in view'}</strong><label><Search size={13}/><input aria-label="Search world events" placeholder="Search events, places…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Clear event search" onClick={()=>setQuery('')}><X size={13}/></button>}</label></header><div className="world-event-list">{visible.slice(0,100).map(i=><button key={i.id} className={`world-event ${!chokepoint&&event?.id===i.id?'selected':''}`} onClick={()=>select(i)}><span className={`world-event-type layer-${i.layer||'news'}`}>{i.layer==='disaster'?'NATURAL EVENT':i.layer==='shipping'?'SHIPPING':i.matchKind==='company'?'HELD COMPANY':i.entityIds.length?'MACRO CONTEXT':'GLOBAL NEWS'}{materialEvent(i.title)?' · REVIEW':''}</span><strong>{i.title}</strong><small>{i.source} · {clock(i.publishedAt)}{i.matchKind==='company'&&i.exposureWeight!=null?` · ${percent(i.exposureWeight,2)} linked`:''}</small></button>)}{!visible.length&&<p className="world-empty">{busy?'Checking external sources…':'No events match these filters. Try Global, another layer or a wider time window.'}</p>}{visible.length>100&&<p className="world-empty">Showing 100 of {visible.length}. Use the timeline or search to narrow the list.</p>}</div></div>
      </div>
      <aside className="world-inspector">
        {chokepoint?<><span className="ws-kicker">SHIPPING INFRASTRUCTURE</span><h3>{chokepoint.name}</h3><span className="world-context-badge">{chokepoint.status==='reference'?'Reference location · live status unavailable':'Reported transit observations'}</span><p>{chokepoint.detail}</p><h4>Associated routes</h4><ul>{chokepoint.routes.map(r=><li key={r}>{r}</li>)}</ul><p className="world-caveat">Route names describe infrastructure. Company use of these routes is not supplied by the client dataset.</p><a className="ws-link" href={chokepoint.url} target="_blank" rel="noreferrer">Source methodology ↗</a><h4>Related reporting</h4>{relatedChokepointNews.length?relatedChokepointNews.map(i=><button className="world-related-story" key={i.id} onClick={()=>{setQuery('');setDay('');setRelevant(false);setLayers(l=>({...l,news:true}));select(i);}}>{i.title} ↗</button>):<p>No matching report in the available feed.</p>}</>:event?<>
          <span className="ws-kicker">SELECTED EVENT</span><h3>{event.title}</h3><p className="world-byline">{event.source} · {clock(event.publishedAt)}</p>
          <span className="world-context-badge">{direct.length?'Company connection':linked.length?'Country / sector context':'Global context · no portfolio match'}</span>
          <div className="world-linked-list">{linked.slice(0,4).map(t=><button className="world-linked" key={t.id} onClick={()=>onGraph(t.id)}><span>{t.name}<small>{t.kind||'Company'} · {t.via}</small></span><b>{t.weight==null?'—':percent(t.weight,2)}<ArrowUpRight size={12}/></b></button>)}</div>
          <p className="world-next-question">{eventQuestion(analysis,event)}</p>
          <div className="world-actions"><button className="ws-button ws-button--primary" disabled={!linked.length} onClick={()=>onTrace(event)}><Network size={14}/>Trace to portfolio</button><button className="ws-button" onClick={()=>onAsk(discussion())}>Prepare event question<ArrowUpRight size={13}/></button><button className="ws-link" onClick={()=>onPin(event)}><BookmarkPlus size={13}/>Add to meeting brief</button></div>
          <p className="world-caveat">Linked weight is exposure, not a predicted loss. Country classification does not establish revenue or supply-chain exposure.</p>
          {clientNote&&<details className="world-source-detail"><summary>Recorded client context</summary><p>{clientNote.body}</p><button className="ws-link" onClick={()=>onEvidence(clientNote.evidence[0])}>Client record ↗</button></details>}
          <details className="world-source-detail"><summary>What the source reports</summary>{event.summary?<p>{event.summary}</p>:<p>No article summary supplied. Open the original source.</p>}<button className="ws-link" onClick={()=>onEvidence(contextEvidence(event))}>Inspect evidence & original source ↗</button><p className="world-caveat">Publication dates are current-world context; they do not explain shifted historical portfolio changes.</p></details>
          {!!companies.length&&<details className="world-scenario" open={scenarioOpen} onToggle={e=>setScenarioOpen(e.currentTarget.open)}><summary>Explore a hypothetical company move</summary><label>Company<select aria-label="Scenario company exposure" value={scenario?.id||''} onChange={e=>{setEventId(event.id);setScenarioId(e.target.value);}}><option value="">Choose a company…</option>{companies.map(t=><option key={t.id} value={t.id}>{t.name} · {percent(t.weight!,2)}</option>)}</select></label>{scenario&&!eligible.some(t=>t.id===scenario.id)&&<p className="world-caveat">Independent scenario: {scenario.name}. No connection to this event is established.</p>}<label>Assumed price move<strong>{move>0?'+':''}{move}%</strong><input aria-label="Hypothetical company price move" type="range" min="-50" max="50" step="1" value={move} onChange={e=>setMove(Number(e.target.value))}/></label><output><b>{effect==null?'Select a company':`${effect>0?'+':''}${(effect*100).toFixed(2)} pp`}</b><span>{scenario?`${percent(scenario.weight!,2)} covered exposure × ${move}% assumed move`:'No automatic company choice for a macro event'}</span>{effect!=null&&analysis.aum!=null&&<small>{money(analysis.aum*effect,analysis.currency)}</small>}</output><p className="world-caveat">Hypothetical sensitivity, not a forecast. Other prices, holdings and FX held fixed. Fund look-through may be partial.</p></details>}
        </>:<><span className="ws-kicker">EXPLORE THE WORLD</span><h3>Select an event or a shipping chokepoint.</h3><p>Inspect what happened, its source and any supported connection to this client.</p></>}
      </aside>
    </div>
    <details className="world-source-status"><summary>Sources & coverage · {status?.layers?.filter(l=>l.state==='available').length||0} available layers{busy?' · refreshing':''}</summary><div className="world-coverage-grid"><div><strong>World Monitor news</strong><p>{status?.message||'Connecting news…'}</p><small>{status?.articles||0} source articles screened · {status?.matched||0} matched</small></div>{status?.layers?.map(l=><div key={l.id}><strong>{l.label}<span>{l.state}</span></strong><p>{l.message}</p><a href={l.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a></div>)}</div><p>Retrieved {status?.retrievedAt?clock(status.retrievedAt):'—'}. Market quotes have their own observation times. A source returning no data does not establish that no event exists.</p></details>
  </section>;
}
