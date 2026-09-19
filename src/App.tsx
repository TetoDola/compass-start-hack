import { selectedEventFact, type EventDiscussion } from './lib/eventContext';
import { WorldView } from './WorldView';
import { aggregateProducts, clientContextEvidence, mandate } from './lib/advisory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, ArrowDownToLine, ArrowUpRight, Check, ChevronDown, Compass, FileText, Info, MessageCircle, Network, RefreshCw, Upload, X, Moon, Sun } from 'lucide-react';
import type { Dataset, Evidence } from './lib/types';
import { analyze } from './lib/analysis';
import { dateLabel, list, money, percent } from './lib/format';
import { parseDatasetUpload } from './lib/import';
import { advisorFacts } from './lib/advisor';
import { sections, type ContextItem } from './lib/briefing';
import type { TimeRange } from './lib/portfolio';
import { EvidenceDrawer } from './components';
import { useFundHoldings } from './useFundHoldings';
import { useBriefing } from './useBriefing';
import { CustomerGraph } from './CustomerGraph';
import { ClientWorkspace } from './ClientWorkspace';
import { AdvisorChat } from './AdvisorChat';
import { CustomerRecords } from './CustomerRecords';
import { WorkspaceDialog } from './WorkspaceDialog';
import { MarketNewsPanel } from './MarketNewsPanel';
import './workspace.css';

type Panel = 'world' | 'graph' | 'records' | 'news' | null;
export default function App() {
  const [dataset,setDataset]=useState<Dataset|null>(null), initialDataset=useRef<Dataset|null>(null);
  const [loadError,setLoadError]=useState(''), [customerId,setCustomerId]=useState<number|null>(null), [scope,setScope]=useState('all');
  const [range,setRange]=useState<TimeRange>('1M'), [panel,setPanel]=useState<Panel>(null);
  const [newsFocus,setNewsFocus]=useState<{id:string;name:string}|null>(null), [selectedId,setSelectedId]=useState('');
  const [graphOverview,setGraphOverview]=useState(true), [contextFocus,setContextFocus]=useState(''), [nodeFocus,setNodeFocus]=useState('');
  const [evidence,setEvidence]=useState<Evidence|null>(null), returnPanel=useRef<Panel>(null);
  const [importMessage,setImportMessage]=useState(''), [importError,setImportError]=useState(false), [importing,setImporting]=useState(false);
  const uploadRef=useRef<HTMLInputElement>(null);
  const [theme,setTheme]=useState<'dark'|'light'>(()=>localStorage.getItem('compass-theme')==='light'?'light':'dark');
  useEffect(()=>{localStorage.setItem('compass-theme',theme);},[theme]);
  const [chatOpen,setChatOpen]=useState(false),[chatDraft,setChatDraft]=useState<{text:string;id:number;event?:EventDiscussion}>();
  const [exploreEvent,setExploreEvent]=useState<ContextItem>();
  const chatRef=useRef<HTMLDivElement>(null),chatLauncher=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(chatOpen)chatRef.current?.querySelector('textarea')?.focus({preventScroll:true});},[chatOpen,chatDraft]);
  function openChat(question?:string){if(question)setChatDraft({text:question,id:Date.now()});setChatOpen(true);}
  function discussEvent(event:EventDiscussion){closePanel();setChatDraft({text:'Explain this event’s relevance and prepare the client conversation.',id:Date.now(),event});setChatOpen(true);}
  function closeChat(){setChatOpen(false);chatLauncher.current?.focus({preventScroll:true});}
  useEffect(()=>{
    let alive=true;
    fetch('/data/case-data.json').then(r=>{if(!r.ok)throw new Error('The case dataset could not be loaded. Run npm run prepare:data, then reload.');return r.json();}).then((d:Dataset)=>{
      if(!alive)return;initialDataset.current=d;setDataset(d);
      const query=new URLSearchParams(location.search), requested=d.clients.find(c=>String(c.ClientId)===query.get('customer'));
      const customer=requested || d.clients.find(c=>list(c.Portfolios).some(p=>list(p.SecurityPositions).length)) || d.clients[0];
      setCustomerId(customer.ClientId);const nextScope=query.get('portfolio');if(nextScope && list(customer.Portfolios).some(p=>String(p.PortfolioId)===nextScope))setScope(nextScope);
      // Old links keep their client/scope; the primary destination is always this workspace.
      const nextPanel=query.get('panel');if(['world','graph','records','news'].includes(nextPanel || ''))setPanel(nextPanel as Panel);
      setSelectedId(query.get('finding') || '');setGraphOverview(query.get('graph')!=='finding');
    }).catch(e=>{if(alive)setLoadError(e.message);});return()=>{alive=false;};
  },[]);
  const customer=dataset?.clients.find(c=>c.ClientId===customerId);
  const analysis=useMemo(()=>dataset && customer?analyze(dataset,customer,scope):null,[dataset,customer,scope]);
  const fundLookups=useFundHoldings(analysis,setDataset), briefing=useBriefing(analysis);
  const graphContext=useMemo(()=>exploreEvent&&briefing.context?{...briefing.context,items:[...briefing.context.items.filter(i=>i.id!==exploreEvent.id),exploreEvent]}:briefing.context,[briefing.context,exploreEvent]);
  const selected=analysis?.findings.find(f=>f.id===selectedId) || analysis?.findings.find(f=>f.section==='now') || analysis?.findings[0];
  useEffect(()=>{
    if(customerId==null)return;const params=new URLSearchParams({customer:String(customerId),view:'overview'});
    if(scope!=='all')params.set('portfolio',scope);if(panel)params.set('panel',panel);
    if(panel==='graph' && !graphOverview){params.set('finding',selectedId);params.set('graph','finding');}
    history.replaceState(null,'',`${location.pathname}?${params}`);
  },[customerId,scope,panel,selectedId,graphOverview]);
  const showEvidence=(e:Evidence)=>{returnPanel.current=panel;setPanel(null);setEvidence(e);};
  const closeEvidence=useCallback(()=>{setEvidence(null);setPanel(returnPanel.current);returnPanel.current=null;},[]);
  function resetContext(){setExploreEvent(undefined);setNewsFocus(null);setSelectedId('');setGraphOverview(true);setContextFocus('');setNodeFocus('');setPanel(null);setEvidence(null);setChatOpen(false);setChatDraft(undefined);returnPanel.current=null;}
  function selectCustomer(id:number){setCustomerId(id);setScope('all');resetContext();window.scrollTo({top:0});}
  function closePanel(){setPanel(null);setNodeFocus('');setContextFocus('');}
  function openGraph(node=''){setNodeFocus(node);setContextFocus('');setGraphOverview(true);setPanel('graph');}
  function openFinding(id:string){setSelectedId(id);setNodeFocus('');setContextFocus('');setGraphOverview(false);setPanel('graph');}
  function openNewsGraph(id:string){setExploreEvent(undefined);setContextFocus(id);setNodeFocus('');setGraphOverview(true);setPanel('graph');}
  function traceWorldEvent(item:ContextItem){setExploreEvent(item);setContextFocus(item.id);setNodeFocus('');setGraphOverview(true);setPanel('graph');}
  function openNews(id?:string,name?:string){setNewsFocus(id?{id,name:name || id}:null);setPanel('news');}
  async function importFile(file?:File){
    if(!file || !dataset)return;setImporting(true);setImportMessage('');
    try{if(file.size>25*1024*1024)throw new Error('Choose a customer JSON file smaller than 25 MB.');const imported=parseDatasetUpload(await file.text(),dataset.reference);setDataset({...dataset,clients:imported.clients,reference:imported.reference,version:`Imported · ${file.name}`});selectCustomer(imported.clients[0].ClientId);setImportError(false);setImportMessage(`Imported ${imported.clients.length} customer${imported.clients.length===1?'':'s'} from ${file.name}. ${imported.suppliedReference?'Uploaded reference data is active.':'Existing reference data is reused.'}`);}catch(e){setImportError(true);setImportMessage(e instanceof Error?e.message:'Unable to import this file.');}finally{setImporting(false);if(uploadRef.current)uploadRef.current.value='';}
  }
  function exportBrief(){
    if(!analysis)return;const content=[`# Customer brief · ${analysis.customer.ClientRef}`,'',`Scope: ${scope==='all'?'All supplied portfolios':analysis.portfolios[0]?.PortfolioNr}`,'',briefing.message,'',...advisorFacts(analysis,briefing.context).filter(f=>['attention','events','customer'].includes(f.id)).flatMap(f=>[`## ${f.title}`,'',...f.text.map(point=>`- ${point}`),'',...f.evidence.map(e=>`Source: ${e.location}`),'']),...sections.flatMap(section=>[`## ${section.title}`,'',...briefing.selection[section.id].flatMap(id=>{const c=briefing.candidates.find(c=>c.id===id);return c?[...c.text.split('\n').filter(Boolean).map(point=>`- ${point}`),...c.sourceIds.map(id=>{const e=c.evidence?.find(e=>e.id===id)||analysis.evidence.find(e=>e.id===id),external=briefing.context?.items.find(i=>i.id===id);return `Source: ${e?.location || external?.url || id}`;}),'']:[];})]),...(briefing.talkingPoint?['## Selected meeting event','',...selectedEventFact(analysis,briefing.talkingPoint)!.text.map(p=>`- ${p}`),`Source: ${briefing.talkingPoint.item.url}`]:[]),'Case dates are shifted. Current news does not establish historical causality. Prepared for adviser review.'];
    const url=URL.createObjectURL(new Blob([content.join('\n')],{type:'text/markdown'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`${analysis.customer.ClientRef}-brief.md`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(loadError)return <div className="boot-screen"><Compass size={42}/><h1>Let’s reconnect the data.</h1><p>{loadError}</p><button className="button primary" onClick={()=>location.reload()}>Retry loading</button></div>;
  if(!dataset || !analysis || !customer || !selected)return <div className="boot-screen"><Compass className="loading-compass" size={42}/><h1>Preparing your workspace</h1><p>Connecting customer records and portfolio context…</p></div>;
  const imported=dataset.version.startsWith('Imported'), latestFactory=analysis.portfolios.map(p=>p.FactoryDateUtc).filter(Boolean).sort().at(-1);
  const kind=customer.IsClientACompany===true?'Company':customer.IsClientACompany===false?'Private client':'Customer';
  const service=mandate(analysis), largest=aggregateProducts(analysis)[0];
  return <div className="workspace-app" data-theme={theme}>
    <header className="ws-topbar"><a className="ws-brand" href="#" onClick={e=>{e.preventDefault();window.scrollTo({top:0});}}><Compass size={22}/><span>compass<span>.</span></span></a><span className="ws-topbar-title">WEALTH INTELLIGENCE</span><div className="ws-topbar-actions"><button className="ws-button ws-button--primary ws-world-launcher" aria-label="Open World view" onClick={()=>setPanel('world')}><Globe2 size={15}/>World</button><span className="ws-data-connected"><i/>{imported?'Imported dataset':'Case workspace'}</span>{imported && <button className="ws-link" onClick={()=>{const d=initialDataset.current!;setDataset(d);selectCustomer(d.clients[0].ClientId);setImportMessage('Original case dataset restored.');setImportError(false);}}>Restore cases</button>}<button className="ws-icon" aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</button><input ref={uploadRef} type="file" accept="application/json,.json" className="visually-hidden" aria-label="Import customer JSON" onChange={e=>void importFile(e.target.files?.[0])}/><button className="ws-button" disabled={importing} onClick={()=>uploadRef.current?.click()}><Upload size={14}/>{importing?'Importing…':'Import clients'}</button></div></header>
    <main className="ws-page">{importMessage && <div className={`ws-notice ${importError?'error':'success'}`} role={importError?'alert':'status'}>{importError?<Info size={16}/>:<Check size={16}/>}<p>{importMessage}</p><button className="ws-icon" aria-label="Dismiss import message" onClick={()=>setImportMessage('')}><X size={16}/></button></div>}
      <h1 className="visually-hidden">Client overview · {customer.ClientRef}</h1>
      <section className="ws-client-header">
        <div className="ws-identity"><label className="ws-client-picker"><span className="ws-kicker">Client workspace</span><div><select aria-label="Choose client" value={customerId!} onChange={e=>selectCustomer(Number(e.target.value))}>{dataset.clients.map(c=><option key={c.ClientId} value={c.ClientId}>{c.ClientRef}</option>)}</select><ChevronDown size={16}/></div></label><div className="ws-client-description"><span>{kind} · {customer.ReportingCurrency || 'Currency unavailable'}</span><button onClick={()=>showEvidence(clientContextEvidence(analysis))}>{service.label || 'Mandate not supplied'}<ArrowUpRight size={12}/></button></div></div>
        <label className={`ws-scope ${analysis.scopeAmbiguous?'is-ambiguous':''}`}><span>Portfolio scope</span><select aria-label="Portfolio scope" value={scope} onChange={e=>{setScope(e.target.value);resetContext();}}><option value="all">All portfolios ({list(customer.Portfolios).length})</option>{list(customer.Portfolios).map(p=><option key={p.PortfolioId} value={String(p.PortfolioId)}>{p.PortfolioNr}</option>)}</select></label>
        <div className="ws-client-actions"><button className="ws-button" onClick={()=>setPanel('records')}><FileText size={14}/>Records</button><button className="ws-button" onClick={exportBrief}><ArrowDownToLine size={14}/>Export brief</button><button className="ws-button" onClick={()=>openGraph()}><Network size={15}/>Connections</button></div>
      </section>
      <div className="ws-context-strip"><span>{analysis.strategy}<span className="ws-separator">/</span>Profile {dateLabel(customer.ProfilingDateUtc,true)}</span><span>{latestFactory?`Record snapshot ${dateLabel(latestFactory,true)}`:'Snapshot date unavailable'} · Case dates shifted</span></div>
      {analysis.scopeAmbiguous && <div className="ws-scope-warning" role="alert"><Info size={15}/><span>Portfolios may overlap. Select one portfolio above to see reliable totals and weights.</span></div>}
      <section className="ws-snapshot" aria-label="Client portfolio snapshot">
        <div><span>Portfolio value <small>{analysis.currency}</small></span><strong>{money(analysis.aum,analysis.currency)}</strong><small>Selected portfolio scope</small></div>
        <div><span>{service.pension?'Pension account liquidity':'Reported liquidity'}</span><strong>{money(analysis.liquidity,analysis.currency)}</strong><small title={service.cashLabel}>{analysis.aum && analysis.liquidity!=null?`${percent(analysis.liquidity/analysis.aum)} of assets · `:''}{service.pension?'Eligibility unverified':'Reported balance'}</small></div>
        <div><span>Positions</span><strong>{analysis.holdings.length}<small> / {analysis.portfolios.length} portfolio{analysis.portfolios.length===1?'':'s'}</small></strong><small>Securities · cash separate</small></div>
        <div className="ws-largest"><span>Largest investment</span><strong>{largest && analysis.weightsAvailable?percent(largest.weight,1):'—'}<small> of portfolio</small></strong>{largest && analysis.weightsAvailable?<button onClick={()=>openGraph(largest.id)} title={largest.name}>{largest.name}<ArrowUpRight size={12}/></button>:<small>{analysis.scopeAmbiguous?'Choose a scope to compare holdings':'Position weights unavailable'}</small>}</div>
      </section>
      <div className="ws-mandate-line"><span>Mandate</span><p>{service.instruction}</p><button className="ws-link" onClick={()=>showEvidence(clientContextEvidence(analysis))}>Source<ArrowUpRight size={11}/></button></div>
      <ClientWorkspace key={`${customerId}:${scope}`} analysis={analysis} briefing={briefing} range={range} onRange={setRange} onEvidence={showEvidence} onGraph={openGraph} onFinding={openFinding} onNewsGraph={openNewsGraph} onNews={openNews} onRecords={()=>setPanel('records')}/>
      <footer className="ws-footer"><span>{latestFactory?`Risk snapshot ${dateLabel(latestFactory,true)}`:'Supplied customer records'} · Case dates are shifted</span><button className="ws-link" disabled={!!briefing.phase} onClick={()=>briefing.refresh()}><RefreshCw size={12}/>{briefing.phase?'Updating news…':'Refresh sources'}</button></footer>
    </main>
    <WorkspaceDialog open={panel==='graph'||panel==='world'} title={`Explore · ${customer.ClientRef}`} wide onClose={closePanel}><nav className="ws-explore-tabs" aria-label="Explore view"><button aria-pressed={panel==='world'} onClick={()=>setPanel('world')}><Globe2 size={15}/>World</button><button aria-pressed={panel==='graph'} onClick={()=>openGraph()}><Network size={15}/>Connections</button></nav><div hidden={panel!=='world'}><WorldView key={`${customerId}:${scope}`} analysis={analysis} context={briefing.context} range={briefing.newsRange} onRange={briefing.setNewsRange} onEvidence={showEvidence} onGraph={openGraph} onTrace={traceWorldEvent} onAsk={discussEvent} onPin={item=>{briefing.pinEvent(item);closePanel();setTimeout(()=>document.querySelector('[aria-label="Client briefing"]')?.scrollIntoView({behavior:'smooth',block:'start'}),0);}} onRefresh={()=>briefing.refresh()} busy={!!briefing.phase}/></div><div hidden={panel!=='graph'}><CustomerGraph context={graphContext} onDiscuss={item=>discussEvent({item,customerId:analysis.customer.ClientId,scope:analysis.scope})} contextFocus={contextFocus} nodeFocus={nodeFocus} fundStatus={fundLookups.status} onRefreshFund={fundLookups.refresh} analysis={analysis} selected={selected} overview={graphOverview} onOverview={()=>{setGraphOverview(true);setContextFocus('');setNodeFocus('');}} onSelect={openFinding} onEvidence={showEvidence} onBrief={closePanel}/></div></WorkspaceDialog>
    <WorkspaceDialog open={panel==='records'} title={`Client records · ${customer.ClientRef}`} wide onClose={closePanel}><CustomerRecords key={`${customerId}:${scope}`} analysis={analysis} dataset={dataset} onEvidence={showEvidence}/></WorkspaceDialog>
    <WorkspaceDialog open={panel==='news'} title={newsFocus?`News · ${newsFocus.name}`:`Portfolio news · ${customer.ClientRef}`} onClose={closePanel}><MarketNewsPanel key={`${customerId}:${scope}`} briefing={briefing} focus={newsFocus} onClear={()=>setNewsFocus(null)} onEvidence={showEvidence} onGraph={openNewsGraph}/></WorkspaceDialog>
    <div ref={chatRef} id="workspace-assistant" className="ws-chat-popup" role="dialog" aria-label="Client assistant" hidden={!chatOpen} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closeChat();}}}><AdvisorChat key={`${customerId}:${scope}`} compact analysis={analysis} context={briefing.context} phase={briefing.phase} draft={chatDraft} onClose={closeChat} onWorkspace={closeChat} onEvidence={showEvidence} onNews={openNews} onRefresh={()=>briefing.refresh()}/></div>
    <button ref={chatLauncher} className="ws-chat-launcher" aria-label={chatOpen?'Minimize Ask Compass':'Open Ask Compass'} aria-expanded={chatOpen} aria-controls="workspace-assistant" onClick={()=>chatOpen?closeChat():openChat()}><MessageCircle size={21}/><span>Ask Compass</span>{chatOpen && <ChevronDown size={16}/>}</button>
    {evidence && <EvidenceDrawer evidence={evidence} onClose={closeEvidence}/>}
  </div>;
}
