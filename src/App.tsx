import { mandate } from './lib/advisory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Check, ChevronDown, Compass, FileText, Info, MessageCircle, Network, RefreshCw, Upload, X } from 'lucide-react';
import type { Dataset, Evidence } from './lib/types';
import { analyze } from './lib/analysis';
import { dateLabel, list, money, percent } from './lib/format';
import { parseDatasetUpload } from './lib/import';
import { advisorFacts } from './lib/advisor';
import { sections } from './lib/briefing';
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

type Panel = 'graph' | 'records' | 'news' | null;
export default function App() {
  const [dataset,setDataset]=useState<Dataset|null>(null), initialDataset=useRef<Dataset|null>(null);
  const [loadError,setLoadError]=useState(''), [customerId,setCustomerId]=useState<number|null>(null), [scope,setScope]=useState('all');
  const [range,setRange]=useState<TimeRange>('1M'), [panel,setPanel]=useState<Panel>(null);
  const [newsFocus,setNewsFocus]=useState<{id:string;name:string}|null>(null), [selectedId,setSelectedId]=useState('');
  const [graphOverview,setGraphOverview]=useState(true), [contextFocus,setContextFocus]=useState(''), [nodeFocus,setNodeFocus]=useState('');
  const [evidence,setEvidence]=useState<Evidence|null>(null), returnPanel=useRef<Panel>(null);
  const [importMessage,setImportMessage]=useState(''), [importError,setImportError]=useState(false), [importing,setImporting]=useState(false);
  const uploadRef=useRef<HTMLInputElement>(null);
  const [chatOpen,setChatOpen]=useState(false),[chatDraft,setChatDraft]=useState<{text:string;id:number}>();
  const chatRef=useRef<HTMLDivElement>(null),chatLauncher=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(chatOpen)chatRef.current?.querySelector('textarea')?.focus({preventScroll:true});},[chatOpen,chatDraft]);
  function openChat(question?:string){if(question)setChatDraft({text:question,id:Date.now()});setChatOpen(true);}
  function closeChat(){setChatOpen(false);chatLauncher.current?.focus({preventScroll:true});}
  useEffect(()=>{
    let alive=true;
    fetch('/data/case-data.json').then(r=>{if(!r.ok)throw new Error('The case dataset could not be loaded. Run npm run prepare:data, then reload.');return r.json();}).then((d:Dataset)=>{
      if(!alive)return;initialDataset.current=d;setDataset(d);
      const query=new URLSearchParams(location.search), requested=d.clients.find(c=>String(c.ClientId)===query.get('customer'));
      const customer=requested || d.clients.find(c=>list(c.Portfolios).some(p=>list(p.SecurityPositions).length)) || d.clients[0];
      setCustomerId(customer.ClientId);const nextScope=query.get('portfolio');if(nextScope && list(customer.Portfolios).some(p=>String(p.PortfolioId)===nextScope))setScope(nextScope);
      // Old links keep their client/scope; the primary destination is always this workspace.
      const nextPanel=query.get('panel');if(['graph','records','news'].includes(nextPanel || ''))setPanel(nextPanel as Panel);
      setSelectedId(query.get('finding') || '');setGraphOverview(query.get('graph')!=='finding');
    }).catch(e=>{if(alive)setLoadError(e.message);});return()=>{alive=false;};
  },[]);
  const customer=dataset?.clients.find(c=>c.ClientId===customerId);
  const analysis=useMemo(()=>dataset && customer?analyze(dataset,customer,scope):null,[dataset,customer,scope]);
  const fundLookups=useFundHoldings(analysis,setDataset), briefing=useBriefing(analysis);
  const selected=analysis?.findings.find(f=>f.id===selectedId) || analysis?.findings.find(f=>f.section==='now') || analysis?.findings[0];
  useEffect(()=>{
    if(customerId==null)return;const params=new URLSearchParams({customer:String(customerId),view:'overview'});
    if(scope!=='all')params.set('portfolio',scope);if(panel)params.set('panel',panel);
    if(panel==='graph' && !graphOverview){params.set('finding',selectedId);params.set('graph','finding');}
    history.replaceState(null,'',`${location.pathname}?${params}`);
  },[customerId,scope,panel,selectedId,graphOverview]);
  const showEvidence=(e:Evidence)=>{returnPanel.current=panel;setPanel(null);setEvidence(e);};
  const closeEvidence=useCallback(()=>{setEvidence(null);setPanel(returnPanel.current);returnPanel.current=null;},[]);
  function resetContext(){setNewsFocus(null);setSelectedId('');setGraphOverview(true);setContextFocus('');setNodeFocus('');setPanel(null);setEvidence(null);setChatOpen(false);setChatDraft(undefined);returnPanel.current=null;}
  function selectCustomer(id:number){setCustomerId(id);setScope('all');resetContext();window.scrollTo({top:0});}
  function closePanel(){setPanel(null);setNodeFocus('');setContextFocus('');}
  function openGraph(node=''){setNodeFocus(node);setContextFocus('');setGraphOverview(true);setPanel('graph');}
  function openFinding(id:string){setSelectedId(id);setNodeFocus('');setContextFocus('');setGraphOverview(false);setPanel('graph');}
  function openNewsGraph(id:string){setContextFocus(id);setNodeFocus('');setGraphOverview(true);setPanel('graph');}
  function openNews(id?:string,name?:string){setNewsFocus(id?{id,name:name || id}:null);setPanel('news');}
  async function importFile(file?:File){
    if(!file || !dataset)return;setImporting(true);setImportMessage('');
    try{if(file.size>25*1024*1024)throw new Error('Choose a customer JSON file smaller than 25 MB.');const imported=parseDatasetUpload(await file.text(),dataset.reference);setDataset({...dataset,clients:imported.clients,reference:imported.reference,version:`Imported · ${file.name}`});selectCustomer(imported.clients[0].ClientId);setImportError(false);setImportMessage(`Imported ${imported.clients.length} customer${imported.clients.length===1?'':'s'} from ${file.name}. ${imported.suppliedReference?'Uploaded reference data is active.':'Existing reference data is reused.'}`);}catch(e){setImportError(true);setImportMessage(e instanceof Error?e.message:'Unable to import this file.');}finally{setImporting(false);if(uploadRef.current)uploadRef.current.value='';}
  }
  function exportBrief(){
    if(!analysis)return;const content=[`# Customer brief · ${analysis.customer.ClientRef}`,'',`Scope: ${scope==='all'?'All supplied portfolios':analysis.portfolios[0]?.PortfolioNr}`,'',briefing.message,'',...advisorFacts(analysis,briefing.context).filter(f=>['attention','events','customer'].includes(f.id)).flatMap(f=>[`## ${f.title}`,'',...f.text.map(point=>`- ${point}`),'',...f.evidence.map(e=>`Source: ${e.location}`),'']),...sections.flatMap(section=>[`## ${section.title}`,'',...briefing.selection[section.id].flatMap(id=>{const c=briefing.candidates.find(c=>c.id===id);return c?[...c.text.split('\n').filter(Boolean).map(point=>`- ${point}`),...c.sourceIds.map(id=>{const e=c.evidence?.find(e=>e.id===id)||analysis.evidence.find(e=>e.id===id),external=briefing.context?.items.find(i=>i.id===id);return `Source: ${e?.location || external?.url || id}`;}),'']:[];})]),'Case dates are shifted. Current news does not establish historical causality. Prepared for adviser review.'];
    const url=URL.createObjectURL(new Blob([content.join('\n')],{type:'text/markdown'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`${analysis.customer.ClientRef}-brief.md`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(loadError)return <div className="boot-screen"><Compass size={42}/><h1>Let’s reconnect the data.</h1><p>{loadError}</p><button className="button primary" onClick={()=>location.reload()}>Retry loading</button></div>;
  if(!dataset || !analysis || !customer || !selected)return <div className="boot-screen"><Compass className="loading-compass" size={42}/><h1>Preparing your workspace</h1><p>Connecting customer records and portfolio context…</p></div>;
  const imported=dataset.version.startsWith('Imported'), latestFactory=analysis.portfolios.map(p=>p.FactoryDateUtc).filter(Boolean).sort().at(-1);
  const kind=customer.IsClientACompany===true?'Company':customer.IsClientACompany===false?'Private client':'Customer';
  return <div className="workspace-app"><header className="ws-topbar"><a className="ws-brand" href="#" onClick={e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});}}><Compass size={25}/><span>compass<span>.</span></span></a><span className="ws-topbar-title">Adviser workspace</span><div className="ws-topbar-actions"><span className="ws-data-connected"><i/>{imported?'Imported data':'Case data connected'}</span>{imported && <button className="ws-link" onClick={()=>{const d=initialDataset.current!;setDataset(d);selectCustomer(d.clients[0].ClientId);setImportMessage('Original case dataset restored.');setImportError(false);}}>Restore cases</button>}<input ref={uploadRef} type="file" accept="application/json,.json" className="visually-hidden" aria-label="Import customer JSON" onChange={e=>void importFile(e.target.files?.[0])}/><button className="ws-button" disabled={importing} onClick={()=>uploadRef.current?.click()}><Upload size={15}/>{importing?'Importing…':'Import clients'}</button></div></header>
    <main className="ws-page">{importMessage && <div className={`ws-notice ${importError?'error':'success'}`} role={importError?'alert':'status'}>{importError?<Info size={16}/>:<Check size={16}/>}<p>{importMessage}</p><button className="ws-icon" aria-label="Dismiss import message" onClick={()=>setImportMessage('')}><X size={16}/></button></div>}
      <h1 className="visually-hidden">Client overview · {customer.ClientRef}</h1><section className="ws-client-header"><div><label className="ws-client-picker"><span className="ws-kicker">Client overview</span><div><select aria-label="Choose client" value={customerId!} onChange={e=>selectCustomer(Number(e.target.value))}>{dataset.clients.map(c=><option key={c.ClientId} value={c.ClientId}>{c.ClientRef}</option>)}</select><ChevronDown size={19}/></div></label><p>{kind}<span>·</span>{analysis.strategy}<span>·</span>{customer.ReportingCurrency || 'Currency unavailable'}</p></div><div className="ws-client-actions"><button className="ws-button" onClick={()=>setPanel('records')}><FileText size={15}/>Client records</button><button className="ws-button" onClick={()=>openGraph()}><Network size={15}/>Graph</button><button className="ws-button ws-button--primary" onClick={exportBrief}><ArrowDownToLine size={15}/>Export brief</button><button className="ws-button ws-ask-shortcut" onClick={()=>openChat()}><MessageCircle size={15}/>Ask Compass</button></div></section>
      <section className="ws-snapshot" aria-label="Client portfolio snapshot"><div><span>Portfolio value</span><strong>{money(analysis.aum,analysis.currency)}</strong></div><div><span>{mandate(analysis).pension?'Pension account liquidity':'Reported liquidity'}</span><strong>{money(analysis.liquidity,analysis.currency)}<small title={mandate(analysis).cashLabel}>{analysis.aum && analysis.liquidity!=null?`${percent(analysis.liquidity/analysis.aum)} of assets`:''}</small></strong></div><div><span>Positions</span><strong>{analysis.holdings.length}<small>across {analysis.portfolios.length} portfolio{analysis.portfolios.length===1?'':'s'}</small></strong></div><label className="ws-scope"><span>Portfolio scope</span><select aria-label="Portfolio scope" value={scope} onChange={e=>{setScope(e.target.value);resetContext();}}><option value="all">All portfolios ({list(customer.Portfolios).length})</option>{list(customer.Portfolios).map(p=><option key={p.PortfolioId} value={String(p.PortfolioId)}>{p.PortfolioNr}</option>)}</select></label></section>
      <ClientWorkspace key={`${customerId}:${scope}`} analysis={analysis} briefing={briefing} range={range} onRange={setRange} onEvidence={showEvidence} onGraph={openGraph} onFinding={openFinding} onNewsGraph={openNewsGraph} onNews={openNews} onRecords={()=>setPanel('records')} onAsk={openChat}/>
      <footer className="ws-footer"><span>{latestFactory?`Risk snapshot ${dateLabel(latestFactory,true)}`:'Supplied customer records'} · Case dates are shifted</span><button className="ws-link" disabled={!!briefing.phase} onClick={()=>briefing.refresh()}><RefreshCw size={12}/>{briefing.phase?'Updating news…':'Refresh sources'}</button></footer>
    </main>
    <WorkspaceDialog open={panel==='graph'} title="Connections" wide onClose={closePanel}><CustomerGraph context={briefing.context} contextFocus={contextFocus} nodeFocus={nodeFocus} fundStatus={fundLookups.status} onRefreshFund={fundLookups.refresh} analysis={analysis} selected={selected} overview={graphOverview} onOverview={()=>{setGraphOverview(true);setContextFocus('');setNodeFocus('');}} onSelect={openFinding} onEvidence={showEvidence} onBrief={closePanel}/></WorkspaceDialog>
    <WorkspaceDialog open={panel==='records'} title="Client records" wide onClose={closePanel}><CustomerRecords key={`${customerId}:${scope}`} analysis={analysis} dataset={dataset} onEvidence={showEvidence}/></WorkspaceDialog>
    <WorkspaceDialog open={panel==='news'} title={newsFocus?`News · ${newsFocus.name}`:'Portfolio news'} onClose={closePanel}><MarketNewsPanel key={`${customerId}:${scope}`} briefing={briefing} focus={newsFocus} onClear={()=>setNewsFocus(null)} onEvidence={showEvidence} onGraph={openNewsGraph}/></WorkspaceDialog>
    <div ref={chatRef} id="workspace-assistant" className="ws-chat-popup" role="dialog" aria-label="Client assistant" hidden={!chatOpen} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closeChat();}}}><AdvisorChat key={`${customerId}:${scope}`} compact analysis={analysis} context={briefing.context} phase={briefing.phase} draft={chatDraft} onClose={closeChat} onWorkspace={closeChat} onEvidence={showEvidence} onNews={openNews} onRefresh={()=>briefing.refresh()}/></div>
    <button ref={chatLauncher} className="ws-chat-launcher" aria-label={chatOpen?'Minimize Ask Compass':'Open Ask Compass'} aria-expanded={chatOpen} aria-controls="workspace-assistant" onClick={()=>chatOpen?closeChat():openChat()}><MessageCircle size={21}/><span>Ask Compass</span>{chatOpen && <ChevronDown size={16}/>}</button>
    {evidence && <EvidenceDrawer evidence={evidence} onClose={closeEvidence}/>}
  </div>;
}
