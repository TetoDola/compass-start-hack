import { ClientImpact } from './ClientImpact';
import { ReportedStatement } from './ReportedStatement';
import { selectedEventFact, type EventDiscussion } from './lib/eventContext';
import { WorldView } from './WorldView';
import { aggregateProducts, clientContextEvidence, mandate } from './lib/advisory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, ArrowDownToLine, ArrowUpRight, Check, ChevronDown, FileText, Info, MessageCircle, Network, RefreshCw, Upload, X, Moon, Sun, Mic } from 'lucide-react';
import type { Dataset, Evidence } from './lib/types';
import { analyze } from './lib/analysis';
import { clientName, dateLabel, list, money, percent } from './lib/format';
import { ClientAvatar } from './ClientAvatar';
import { mergeJsonUploads, restoreReferenceClassifications } from './lib/import';
import { PdfImportDialog } from './PdfImportDialog';
import { attachCustodyReport, type CustodyReport } from './lib/pdfImport';
import { loadImportedWorkspace, saveImportedWorkspace, clearImportedWorkspace } from './lib/importStorage';
import { advisorFacts } from './lib/advisor';
import { sections, type ContextItem } from './lib/briefing';
import type { TimeRange } from './lib/portfolio';
import { EvidenceDrawer } from './components';
import { useFundHoldings } from './useFundHoldings';
import { useBriefing } from './useBriefing';
import { CustomerGraph } from './CustomerGraph';
import { ClientBrief } from './ClientBrief';
import { Cockpit } from './Cockpit';
import { AdvisorChat } from './AdvisorChat';
import { CustomerRecords } from './CustomerRecords';
import { WorkspaceDialog } from './WorkspaceDialog';
import { LiveCall } from './LiveCall';
import { MarketNewsPanel } from './MarketNewsPanel';
import './workspace.css';

type Panel = 'world' | 'graph' | 'records' | 'news' | null;
export default function App() {
  const [dataset,setDataset]=useState<Dataset|null>(null), initialDataset=useRef<Dataset|null>(null);
  const [loadError,setLoadError]=useState(''), [customerId,setCustomerId]=useState<number|null>(null), [scope,setScope]=useState('all');
  const [page,setPage]=useState<'overview'|'impact'>(()=>new URLSearchParams(location.search).get('view')==='impact'?'impact':'overview');
  const [range,setRange]=useState<TimeRange>('1M'), [panel,setPanel]=useState<Panel>(null);
  const [newsFocus,setNewsFocus]=useState<{id:string;name:string}|null>(null), [selectedId,setSelectedId]=useState('');
  const [graphOverview,setGraphOverview]=useState(true), [contextFocus,setContextFocus]=useState(''), [nodeFocus,setNodeFocus]=useState('');
  const [evidence,setEvidence]=useState<Evidence|null>(null), returnPanel=useRef<Panel>(null);
  const [importMessage,setImportMessage]=useState(''), [importError,setImportError]=useState(false), [importing,setImporting]=useState(false);
  const uploadRef=useRef<HTMLInputElement>(null);
  const [pdfPreview,setPdfPreview]=useState<{report:CustodyReport;file:File}|null>(null), [pdfError,setPdfError]=useState(''), [importProgress,setImportProgress]=useState('');
  const [theme,setTheme]=useState<'dark'|'light'>(()=>localStorage.getItem('compass-theme')==='dark'?'dark':'light');
  useEffect(()=>{localStorage.setItem('compass-theme',theme);},[theme]);
  const [chatOpen,setChatOpen]=useState(false),[chatDraft,setChatDraft]=useState<{text:string;id:number;event?:EventDiscussion}>();
  const [liveCallOpen,setLiveCallOpen]=useState(false);
  const [exploreEvent,setExploreEvent]=useState<ContextItem>();
  const chatRef=useRef<HTMLDivElement>(null),chatLauncher=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(chatOpen)chatRef.current?.querySelector('textarea')?.focus({preventScroll:true});},[chatOpen,chatDraft]);
  function openChat(question?:string){if(question)setChatDraft({text:question,id:Date.now()});setChatOpen(true);}
  function discussEvent(event:EventDiscussion){closePanel();setChatDraft({text:'Explain this event’s relevance and prepare the client conversation.',id:Date.now(),event});setChatOpen(true);}
  function closeChat(){setChatOpen(false);chatLauncher.current?.focus({preventScroll:true});}
  useEffect(()=>{
    let alive=true;
    fetch('/data/case-data.json').then(r=>{if(!r.ok)throw new Error('The case dataset could not be loaded. Run npm run prepare:data, then reload.');return r.json();}).then(async (original:Dataset)=>{
      let d=original;try{const saved=await loadImportedWorkspace();d=saved?restoreReferenceClassifications(saved,original):original;}catch{if(alive){setImportMessage('Saved imports could not be loaded; showing the case dataset.');setImportError(true);}}
      if(!alive)return;initialDataset.current=original;setDataset(d);
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
    if(customerId==null)return;const params=new URLSearchParams({customer:String(customerId),view:page});
    if(scope!=='all')params.set('portfolio',scope);if(panel)params.set('panel',panel);
    if(panel==='graph' && !graphOverview){params.set('finding',selectedId);params.set('graph','finding');}
    history.replaceState(null,'',`${location.pathname}?${params}`);
  },[customerId,scope,panel,selectedId,graphOverview,page]);
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
  async function importFiles(selection:FileList|null){
    const files=Array.from(selection||[]);
    if(!files.length || !dataset)return;setImporting(true);setImportMessage('');setPdfError('');setImportProgress('Reading files…');
    try{
      const pdfs=files.filter(file=>/\.pdf$/i.test(file.name)||file.type==='application/pdf');
      if(pdfs.length){
        if(files.length!==1)throw new Error('Import one PDF at a time, or select only JSON files.');
        const file=pdfs[0];
        if(file.size>25*1024*1024)throw new Error('Choose a PDF smaller than 25 MB.');
        const {readCustodyPdf}=await import('./lib/pdfReader');
        const report=await readCustodyPdf(file,(done,total)=>setImportProgress(`Reading page ${done} of ${total}…`));
        setPdfPreview({report,file});
      } else {
        const inputs=[];
        for(const [index,file] of files.entries()){
          if(!/\.json$/i.test(file.name)&&file.type!=='application/json')throw new Error(`${file.name}: choose a JSON file.`);
          setImportProgress(`Reading JSON ${index+1} of ${files.length}…`);
          inputs.push({name:file.name,text:await file.text()});
        }
        setImportProgress('Validating clients…');
        const result=mergeJsonUploads(dataset,inputs);
        if(result.added||result.referenceAdded){setImportProgress('Saving workspace…');await saveImportedWorkspace(result.dataset);setDataset(result.dataset);}
        if(result.firstClientId!=null)selectCustomer(result.firstClientId);
        setImportError(false);
        setImportMessage(`Added ${result.added} client${result.added===1?'':'s'} from ${files.length} JSON file${files.length===1?'':'s'}. ${result.skipped?`${result.skipped} already in the workspace. `:''}${result.referenceAdded?'Reference data merged.':'Existing reference data reused.'}`);
      }
    }catch(e){setImportError(true);setImportMessage(e instanceof Error?e.message:'Unable to import this file.');window.scrollTo({top:0,behavior:'smooth'});}finally{setImporting(false);setImportProgress('');if(uploadRef.current)uploadRef.current.value='';}
  }
  async function confirmPdfImport(target:number|'new'){
    if(!pdfPreview||!dataset)return;setImporting(true);setPdfError('');
    try{
      const result=attachCustodyReport(dataset,pdfPreview.report,target);
      if(!result.duplicate)await saveImportedWorkspace(result.dataset,{hash:pdfPreview.report.hash,file:pdfPreview.file});
      setDataset(result.dataset);selectCustomer(result.clientId);setScope(String(result.portfolioId));setPdfPreview(null);setImportError(false);
      setImportMessage(result.duplicate?'This statement was already imported. Opened its existing portfolio.':`Imported ${pdfPreview.report.positions.length} holdings and ${pdfPreview.report.cash.length} cash balances from ${pdfPreview.report.pages} pages. External portfolio saved in this browser.`);
    }catch(e){setPdfError(e instanceof Error?e.message:'Unable to save the import.');}finally{setImporting(false);}
  }
  async function restoreCases(){
    try{await clearImportedWorkspace();const d=initialDataset.current!;setDataset(d);selectCustomer(d.clients[0].ClientId);setImportMessage('Original case dataset restored. Local imports cleared.');setImportError(false);}catch(e){setImportError(true);setImportMessage(e instanceof Error?e.message:'Could not restore cases.');}
  }
  function exportBrief(){
    if(!analysis)return;const content=[`# Customer brief · ${clientName(analysis.customer)}`,'',`Scope: ${scope==='all'?'All supplied portfolios':analysis.portfolios[0]?.PortfolioNr}`,'',briefing.message,'',...advisorFacts(analysis,briefing.context).filter(f=>['attention','events','customer'].includes(f.id)).flatMap(f=>[`## ${f.title}`,'',...f.text.map(point=>`- ${point}`),'',...f.evidence.map(e=>`Source: ${e.location}`),'']),...sections.flatMap(section=>[`## ${section.title}`,'',...briefing.selection[section.id].flatMap(id=>{const c=briefing.candidates.find(c=>c.id===id);return c?[...c.text.split('\n').filter(Boolean).map(point=>`- ${point}`),...c.sourceIds.map(id=>{const e=c.evidence?.find(e=>e.id===id)||analysis.evidence.find(e=>e.id===id),external=briefing.context?.items.find(i=>i.id===id);return `Source: ${e?.location || external?.url || id}`;}),'']:[];})]),...(briefing.talkingPoint?['## Selected meeting event','',...selectedEventFact(analysis,briefing.talkingPoint)!.text.map(p=>`- ${p}`),`Source: ${briefing.talkingPoint.item.url}`]:[]),'Case dates are shifted. Current news does not establish historical causality. Prepared for adviser review.'];
    const url=URL.createObjectURL(new Blob([content.join('\n')],{type:'text/markdown'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`${analysis.customer.ClientRef}-brief.md`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(loadError)return <div className="boot-screen"><img className="boot-brand" src="/assets/logos/uro-light.svg" alt="UNRISKOMEGA"/><h1>Let’s reconnect the data.</h1><p>{loadError}</p><button className="button primary" onClick={()=>location.reload()}>Retry loading</button></div>;
  if(!dataset || !analysis || !customer || !selected)return <div className="boot-screen"><img className="boot-brand loading-brand" src="/assets/logos/uro-light.svg" alt="UNRISKOMEGA"/><h1>Preparing your workspace</h1><p>Connecting customer records and portfolio context…</p></div>;
  const imported=dataset.version.startsWith('Imported'), latestFactory=analysis.portfolios.map(p=>p.FactoryDateUtc).filter(Boolean).sort().at(-1);
  const kind=customer.IsClientACompany===true?'Company':customer.IsClientACompany===false?'Private client':'Customer';
  const service=mandate(analysis), largest=aggregateProducts(analysis)[0];
  return <div className="workspace-app" data-theme={theme}>
    <header className="ws-topbar"><a className="ws-brand" href="#" onClick={e=>{e.preventDefault();window.scrollTo({top:0});}}><img src={`/assets/logos/uro-${theme}.svg`} alt="UNRISKOMEGA"/><span className="ws-brand-product">Compass</span></a><nav className="ws-primary-nav" aria-label="Main navigation"><button className="impact-nav-button" aria-current={page==='overview'?'page':undefined} onClick={()=>{setPage('overview');closePanel();}}>Client overview</button><button className="impact-nav-button" aria-current={page==='impact'?'page':undefined} onClick={()=>{setPage('impact');closePanel();setChatOpen(false);}}>News &amp; Client Impact</button></nav><div className="ws-topbar-actions"><button className="ws-button ws-button--primary ws-world-launcher" aria-label="Open World view" onClick={()=>setPanel('world')}><Globe2 size={15}/>World</button><button className="ws-button" onClick={()=>setLiveCallOpen(true)}><Mic size={14}/>Live Call</button><span className="ws-data-connected"><i/>{imported?'Imported dataset':'Case workspace'}</span>{imported && <button className="ws-link" onClick={()=>void restoreCases()}>Restore cases</button>}<button className="ws-icon" aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</button><input ref={uploadRef} type="file" multiple accept="application/json,.json,application/pdf,.pdf" className="visually-hidden" aria-label="Import client data (JSON files or one PDF)" onChange={e=>void importFiles(e.target.files)}/><button className="ws-button" title="Select one or more JSON files, or one PDF" disabled={importing} onClick={()=>uploadRef.current?.click()}><Upload size={14}/>{importing?(importProgress||'Saving…'):'Import client data'}</button></div></header>
    {liveCallOpen && <LiveCall analysis={analysis} context={briefing.context} customers={dataset.clients} onSelectCustomer={selectCustomer} onSelectScope={setScope} onClose={()=>setLiveCallOpen(false)}/>}
    {pdfPreview && <PdfImportDialog report={pdfPreview.report} dataset={dataset} currentClientId={customerId} busy={importing} error={pdfError} onClose={()=>setPdfPreview(null)} onImport={target=>void confirmPdfImport(target)}/>}
    <main className="ws-page" id="client-overview" hidden={page!=='overview'}>{importMessage && <div className={`ws-notice ${importError?'error':'success'}`} role={importError?'alert':'status'}>{importError?<Info size={16}/>:<Check size={16}/>}<p>{importMessage}</p><button className="ws-icon" aria-label="Dismiss import message" onClick={()=>setImportMessage('')}><X size={16}/></button></div>}
      <h1 className="visually-hidden">Client overview · {clientName(customer)}</h1>
      <section className="ws-client-header">
        <div className="ws-identity"><ClientAvatar client={customer}/><label className="ws-client-picker"><span className="ws-kicker">Client workspace</span><div><select aria-label="Choose client" title={clientName(customer)} value={customerId!} onChange={e=>selectCustomer(Number(e.target.value))}>{dataset.clients.map(c=><option key={c.ClientId} value={c.ClientId}>{clientName(c)}</option>)}</select><ChevronDown size={16}/></div><span className="ws-client-reference">{customer.ClientRef} · {kind}</span></label><div className="ws-client-description"><span>{customer.ReportingCurrency || 'Currency unavailable'}</span><button onClick={()=>showEvidence(clientContextEvidence(analysis))}>{service.label || 'Mandate not supplied'}<ArrowUpRight size={12}/></button></div></div>
        <label className={`ws-scope ${analysis.scopeAmbiguous?'is-ambiguous':''}`}><span>Portfolio scope</span><select aria-label="Portfolio scope" value={scope} onChange={e=>{setScope(e.target.value);resetContext();}}><option value="all">All portfolios ({list(customer.Portfolios).length})</option>{list(customer.Portfolios).map(p=><option key={p.PortfolioId} value={String(p.PortfolioId)}>{p.PortfolioNr}</option>)}</select></label>
        <div className="ws-client-actions"><button className="ws-button" onClick={()=>setPanel('records')}><FileText size={14}/>Records</button><button className="ws-button" onClick={()=>openGraph()}><Network size={15}/>Connections</button><button className="ws-button ws-button--primary" onClick={exportBrief}><ArrowDownToLine size={14}/>Export brief</button></div>
      </section>
      {analysis.scopeAmbiguous && <div className="ws-scope-warning" role="alert"><Info size={15}/><span>Portfolios overlap or use incompatible dates or currencies. Select one portfolio to see reliable totals and weights.</span></div>}
      <section className="ws-snapshot" aria-label="Client portfolio snapshot">
        <div><span>Portfolio value <small>{analysis.currency}</small></span><strong>{money(analysis.aum,analysis.currency)}</strong><small>Selected portfolio scope</small></div>
        <div><span>{service.pension?'Pension account liquidity':'Reported liquidity'}</span><strong>{money(analysis.liquidity,analysis.currency)}</strong><small title={service.cashLabel}>{analysis.aum && analysis.liquidity!=null?`${percent(analysis.liquidity/analysis.aum)} of assets · `:''}{service.pension?'Eligibility unverified':'Reported balance'}</small></div>
        <div><span>Positions</span><strong>{analysis.holdings.length}<small> / {analysis.portfolios.length} portfolio{analysis.portfolios.length===1?'':'s'}</small></strong><small>Securities · cash separate</small></div>
        <div className="ws-largest"><span>Largest investment</span><strong>{largest && analysis.weightsAvailable?percent(largest.weight,1):'—'}<small> of portfolio</small></strong>{largest && analysis.weightsAvailable?<button onClick={()=>openGraph(largest.id)} title={largest.name}>{largest.name}<ArrowUpRight size={12}/></button>:<small>{analysis.scopeAmbiguous?'Choose a scope to compare holdings':'Position weights unavailable'}</small>}</div>
      </section>
      <ReportedStatement analysis={analysis} onEvidence={showEvidence}/>
      <ClientBrief key={`brief:${customerId}:${scope}`} analysis={analysis} briefing={briefing} onEvidence={showEvidence} onNews={()=>openNews()}/>
      <Cockpit key={`${customerId}:${scope}`} analysis={analysis} dataset={dataset} context={briefing.context} range={range} onRange={setRange} onEvidence={showEvidence} onNews={openNews} onGraph={openGraph} onFinding={openFinding} onNewsGraph={openNewsGraph} onRecords={()=>setPanel('records')}/>
      <footer className="ws-footer"><span>{latestFactory?`Record snapshot ${dateLabel(latestFactory,true)}`:'Supplied customer records'} · {analysis.portfolios.some(p=>p.ExternalSource)?'External custody · reported statement values':'Case dates are shifted'}</span><div className="ws-footer-actions"><span className="ws-footer-brand"><span>Challenge partners</span><img src={`/assets/logos/partners-${theme}.png`} alt="Swiss AI Weeks and START Hack Tour" width="1397" height="231" loading="lazy"/></span><button className="ws-link" disabled={!!briefing.phase} onClick={()=>briefing.refresh()}><RefreshCw size={12}/>{briefing.phase?'Updating news…':'Refresh sources'}</button></div></footer>
    </main>
    {page==='impact' && importMessage && <div className={`ws-notice ${importError?'error':'success'}`} role={importError?'alert':'status'}><p>{importMessage}</p><button className="ws-icon" aria-label="Dismiss import message" onClick={()=>setImportMessage('')}><X size={16}/></button></div>}
    <ClientImpact dataset={dataset} active={page==='impact'} originalClientIds={initialDataset.current?.clients.map(c=>c.ClientId)||[]} onOpenClient={(id,nextScope)=>{selectCustomer(id);setScope(nextScope);setPage('overview');}} onEvidence={showEvidence}/>
    <WorkspaceDialog open={panel==='graph'||panel==='world'} title={`Explore · ${clientName(customer)}`} wide onClose={closePanel}><nav className="ws-explore-tabs" aria-label="Explore view"><button aria-pressed={panel==='world'} onClick={()=>setPanel('world')}><Globe2 size={15}/>World</button><button aria-pressed={panel==='graph'} onClick={()=>openGraph()}><Network size={15}/>Connections</button></nav><div hidden={panel!=='world'}><WorldView key={`${customerId}:${scope}`} analysis={analysis} context={briefing.context} range={briefing.newsRange} onRange={briefing.setNewsRange} onEvidence={showEvidence} onGraph={openGraph} onTrace={traceWorldEvent} onAsk={discussEvent} onPin={item=>{briefing.pinEvent(item);closePanel();setTimeout(()=>document.querySelector('[aria-label="Meeting brief"]')?.scrollIntoView({behavior:'smooth',block:'start'}),0);}} onRefresh={()=>briefing.refresh()} busy={!!briefing.phase}/></div><div hidden={panel!=='graph'}><CustomerGraph context={graphContext} onDiscuss={item=>discussEvent({item,customerId:analysis.customer.ClientId,scope:analysis.scope})} contextFocus={contextFocus} nodeFocus={nodeFocus} fundStatus={fundLookups.status} onRefreshFund={fundLookups.refresh} analysis={analysis} selected={selected} overview={graphOverview} onOverview={()=>{setGraphOverview(true);setContextFocus('');setNodeFocus('');}} onSelect={openFinding} onEvidence={showEvidence} onBrief={closePanel}/></div></WorkspaceDialog>
    <WorkspaceDialog open={panel==='records'} title={`Client records · ${clientName(customer)}`} wide onClose={closePanel}><CustomerRecords key={`${customerId}:${scope}`} analysis={analysis} dataset={dataset} onEvidence={showEvidence}/></WorkspaceDialog>
    <WorkspaceDialog open={panel==='news'} title={newsFocus?`News · ${newsFocus.name}`:`Portfolio news · ${clientName(customer)}`} onClose={closePanel}><MarketNewsPanel key={`${customerId}:${scope}`} briefing={briefing} focus={newsFocus} onClear={()=>setNewsFocus(null)} onEvidence={showEvidence} onGraph={openNewsGraph}/></WorkspaceDialog>
    <div ref={chatRef} id="workspace-assistant" className="ws-chat-popup" role="dialog" aria-label="Client assistant" hidden={!chatOpen} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closeChat();}}}><AdvisorChat key={`${customerId}:${scope}`} compact analysis={analysis} context={briefing.context} phase={briefing.phase} draft={chatDraft} onClose={closeChat} onWorkspace={closeChat} onEvidence={showEvidence} onNews={openNews} onRefresh={()=>briefing.refresh()}/></div>
    <button ref={chatLauncher} className="ws-chat-launcher" aria-label={chatOpen?'Minimize Ask Compass':'Open Ask Compass'} aria-expanded={chatOpen} aria-controls="workspace-assistant" onClick={()=>chatOpen?closeChat():openChat()}><MessageCircle size={21}/><span>Ask Compass</span>{chatOpen && <ChevronDown size={16}/>}</button>
    {evidence && <EvidenceDrawer evidence={evidence} onClose={closeEvidence}/>}
  </div>;
}
