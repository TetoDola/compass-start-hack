import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Compass, Database, FileText, Fingerprint, Gauge, Info, Layers3, Menu, Network, Search, ShieldCheck, SlidersHorizontal, Upload, Users, Wallet, X } from 'lucide-react';
import type { Analysis, Dataset, Evidence, Row } from './lib/types';
import { analyze } from './lib/analysis';
import { dateLabel, list, money, number, percent, statusLabel } from './lib/format';
import { instrumentLabel } from './lib/instruments';
import { parseDatasetUpload } from './lib/import';
import { EvidenceDrawer, HistoryChart } from './components';

import { useFundHoldings } from './useFundHoldings';
import { CustomerGraph } from './CustomerGraph';
import { advisorFacts } from './lib/advisor';
import { AdvisorChat } from './AdvisorChat';
import { BriefOverview } from './BriefOverview';
import { useBriefing } from './useBriefing';
import { AttentionPanel, ExposurePanel } from './PortfolioOverview';
import { Cockpit } from './Cockpit';
import type { TimeRange } from './lib/portfolio';
import { sections } from './lib/briefing';

type View = 'cockpit' | 'chat' | 'information' | 'brief' | 'graph';
const viewOptions = [{ id: 'cockpit', title: 'Adviser cockpit', icon: Gauge }, { id: 'chat', title: 'Advisor chat', icon: BookOpen }, { id: 'brief', title: 'Portfolio workspace', icon: Layers3 }] as const;
const activeTab = (view: View) => view === 'cockpit' || view === 'chat' ? view : 'brief';
const workspaceViews = [{id:'brief',title:'Overview'}, {id:'graph',title:'Connection graph'}, {id:'information',title:'Source records'}] as const;

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const initialDataset = useRef<Dataset | null>(null);
  const [loadError, setLoadError] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [scope, setScope] = useState('all');
  const [range, setRange] = useState<TimeRange>('1M');
  const [newsFocus, setNewsFocus] = useState<{ id: string; name: string } | null>(null);
  const [view, setView] = useState<View>('cockpit');
  const [selectedId, setSelectedId] = useState('');
  const [graphOverview, setGraphOverview] = useState(true);
  const [contextFocus, setContextFocus] = useState('');
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [help, setHelp] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/data/case-data.json').then(r => { if (!r.ok) throw new Error('The case dataset could not be loaded. Run npm run prepare:data, then reload.'); return r.json(); }).then((d: Dataset) => {
      if (!alive) return;
      initialDataset.current = d; setDataset(d);
      const query = new URLSearchParams(location.search);
      const requested = d.clients.find(c => String(c.ClientId) === query.get('customer'));
      const customer = requested || d.clients.find(c => list(c.Portfolios).some(p => list(p.SecurityPositions).length)) || d.clients[0];
      setCustomerId(customer.ClientId);
      const nextScope = query.get('portfolio');
      if (nextScope && list(customer.Portfolios).some(p => String(p.PortfolioId) === nextScope)) setScope(nextScope);
      const nextView = query.get('view'); if (['cockpit','chat','brief','graph','information'].includes(nextView || '')) setView(nextView as View);
      setSelectedId(query.get('finding') || '');
      setGraphOverview(query.get('graph') !== 'finding');
    }).catch(e => { if (alive) setLoadError(e.message); });
    return () => { alive = false; };
  }, []);
  const customer = dataset?.clients.find(c => c.ClientId === customerId);
  const analysis = useMemo(() => dataset && customer ? analyze(dataset, customer, scope) : null, [dataset, customer, scope]);
  const fundLookups = useFundHoldings(analysis, setDataset);
  const briefing = useBriefing(analysis);
  const selected = analysis?.findings.find(f => f.id === selectedId) || analysis?.findings.find(f => f.section === 'now') || analysis?.findings[0];
  useEffect(() => {
    if (customerId == null || !analysis) return;
    const params = new URLSearchParams({ customer: String(customerId), view });
    if (scope !== 'all') params.set('portfolio', scope);
    if (selected) params.set('finding', selected.id);
    if (view === 'graph') params.set('graph', graphOverview ? 'overview' : 'finding');
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }, [customerId, view, scope, selected?.id, analysis, graphOverview]);
  const closeEvidence = useCallback(() => setEvidence(null), []);
  const selectCustomer = (id: number) => { setCustomerId(id); setNewsFocus(null); setScope('all'); setSelectedId(''); setGraphOverview(true); setContextFocus(''); setEvidence(null); setSidebarOpen(false); window.scrollTo({ top: 0 }); };

  async function importFile(file?: File) {
    if (!file || !dataset) return;
    setImporting(true); setImportMessage('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Choose a customer JSON file smaller than 25 MB.');
      const imported = parseDatasetUpload(await file.text(), dataset.reference);
      const { clients, reference } = imported;
      setDataset({ ...dataset, clients, reference, version: `Imported · ${file.name}` });
      selectCustomer(clients[0].ClientId); setSearch(''); setImportError(false);
      setImportMessage(`Imported ${clients.length} customer${clients.length === 1 ? '' : 's'} from ${file.name}. ${imported.suppliedReference ? 'The uploaded reference universe is active.' : 'The existing reference universe is reused; unfamiliar instruments retain their supplied metadata.'}`);
    } catch (e) { setImportError(true); setImportMessage(e instanceof Error ? e.message : 'Unable to import this file.'); }
    finally { setImporting(false); if (uploadRef.current) uploadRef.current.value = ''; }
  }
  function exportBrief() {
    if (!analysis) return;
    const content = [`# Customer brief · ${analysis.customer.ClientRef}`, '', `Scope: ${scope === 'all' ? 'All supplied portfolios' : analysis.portfolios[0]?.PortfolioNr}`, '', briefing.message, '', ...advisorFacts(analysis, briefing.context).filter(f=>['attention','events'].includes(f.id)).flatMap(f=>[`## ${f.title}`,'',...f.text,'',...f.evidence.map(e=>`Source: ${e.location}`),'']), ...sections.flatMap(section => [`## ${section.title}`, '', ...briefing.selection[section.id].flatMap(id => { const c = briefing.candidates.find(c => c.id === id); return c ? [c.text, ...c.sourceIds.map(id => { const e = analysis.evidence.find(e => e.id === id); const external = briefing.context?.items.find(i => i.id === id); return `Source: ${e?.location || external?.url || id}`; }), ''] : []; })]), 'Prepared for adviser review. Case dates are shifted. Current news does not establish historical causality. Public house-view samples are not bank-approved policy.', '', ...analysis.warnings, ...(briefing.context?.warnings || [])];
    const url = URL.createObjectURL(new Blob([content.join('\n')], { type: 'text/markdown' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${analysis.customer.ClientRef}-brief.md`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (loadError) return <div className="boot-screen"><Compass size={42} /><h1>Let’s reconnect the data.</h1><p>{loadError}</p><button className="button primary" onClick={() => location.reload()}>Retry loading</button></div>;
  if (!dataset || !analysis || !customer || !selected) return <div className="boot-screen"><Compass className="loading-compass" size={42} /><h1>Preparing your workspace</h1><p>Connecting customer records and portfolio context…</p></div>;
  const visibleClients = dataset.clients.filter(c => `${c.ClientRef} ${c.RiskProfileName || ''}`.toLowerCase().includes(search.toLowerCase()));
  const isImported = dataset.version.startsWith('Imported');
  const latestFactory = analysis.portfolios.map(p => p.FactoryDateUtc).filter(Boolean).sort().at(-1);

  return <div className="app-shell">
    {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setView('brief'); }}><span className="brand-symbol"><Compass size={25} strokeWidth={1.5} /></span><span>compass<span className="brand-period">.</span><small>ADVISOR INTELLIGENCE</small></span></a>
      <div className="workspace-label"><span className="workspace-icon">U</span><div>UNRISKOMEGA<small>Customer workspace</small></div><ShieldCheck size={14} /></div>
      <div className="sidebar-section-title"><span>CUSTOMERS</span><span>{dataset.clients.length}</span></div>
      <div className="sidebar-search"><Search size={15} /><input aria-label="Search customers" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a customer…" /><kbd>⌕</kbd></div>
      <nav className="customer-list" aria-label="Customers">{visibleClients.map(c => <button className={`customer-item ${c.ClientId === customerId ? 'active' : ''}`} key={c.ClientId} onClick={() => selectCustomer(c.ClientId)}><span className="customer-avatar">{String(c.ClientRef).replace('CASE-', '').slice(-2)}</span><span>{c.ClientRef}<small>{list(c.Portfolios).length} portfolio{list(c.Portfolios).length === 1 ? '' : 's'} · {c.ReportingCurrency || '—'}</small></span>{c.ClientId === customerId && <ChevronRight size={15} />}</button>)}{!visibleClients.length && <p className="sidebar-empty">No customers found.</p>}</nav>
      <div className="sidebar-bottom"><input ref={uploadRef} type="file" accept="application/json,.json" aria-label="Import customer JSON" className="visually-hidden" onChange={e => importFile(e.target.files?.[0])} /><button className="import-button" disabled={importing} onClick={() => uploadRef.current?.click()}><Upload size={16} />{importing ? 'Importing…' : 'Import customers'}<PlusSymbol /></button>{isImported && <button className="restore-button" onClick={() => { const d = initialDataset.current!; setDataset(d); selectCustomer(d.clients[0].ClientId); setSearch(''); setImportMessage('Original case dataset restored.'); setImportError(false); }}>Restore case dataset</button>}<div className="advisor-profile"><span>AD</span><div>Advisor workspace<small>START Hack · Working prototype</small></div></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" aria-label="Open customer list" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><Users size={15} /><span>Customers</span><ChevronRight size={13} /><strong>{customer.ClientRef}</strong></div><div className="topbar-right"><span className="source-status"><span />{isImported ? 'Imported customer data' : 'Case data connected'}</span><button className="icon-button" aria-label="About this workspace" onClick={() => setHelp(h => !h)}><CircleHelp size={19} /></button><span className="topbar-avatar">AD</span></div></header>
      <main>
        {help && <div className="notice"><Info size={17} /><p><strong>About this workspace.</strong> A local prototype built from the UNRISKOMEGA dataset. Briefs use verified calculations and source-backed sentences, with optional AI selection when configured. Public company news is fetched on selection; market prices and realtime audio are not connected. Fund top holdings use dated external sources; public fund ISINs can be looked up in the background. Uploaded customer files remain in this browser session.</p><button className="icon-button" aria-label="Dismiss workspace information" onClick={() => setHelp(false)}><X size={16} /></button></div>}
        {importMessage && <div className={`notice ${importError ? 'error' : 'success'}`} role={importError ? 'alert' : 'status'}>{importError ? <Info size={18} /> : <Check size={18} />}<p>{importMessage}</p><button className="icon-button" aria-label="Dismiss import message" onClick={() => setImportMessage('')}><X size={16} /></button></div>}
        <section className="page-heading"><div><div className="eyebrow heading-eyebrow">CUSTOMER INTELLIGENCE <span>/</span> {customer.ClientRef}</div><h1>Your customer, in focus<span>.</span></h1><p>The context you need. The connections that matter.</p></div><button className="button secondary export-button" onClick={exportBrief}><ArrowDownToLine size={16} />Export brief</button></section>
        <section className="customer-summary"><div className="customer-identity"><div className="large-avatar"><Users size={24} strokeWidth={1.5} /></div><div><h2>{customer.ClientRef}<span className="client-type">{customer.IsClientACompany === true ? 'Company' : customer.IsClientACompany === false ? 'Private client' : 'Customer'}</span></h2><p>{analysis.strategy}<span>·</span>{customer.ReportingCurrency || 'Currency unavailable'}</p></div></div><label className="portfolio-filter"><Layers3 size={16} /><select aria-label="Portfolio scope" value={scope} onChange={e => { setScope(e.target.value); setNewsFocus(null); setSelectedId(''); setContextFocus(''); setEvidence(null); }}><option value="all">All portfolios ({list(customer.Portfolios).length})</option>{list(customer.Portfolios).map(p => <option key={p.PortfolioId} value={String(p.PortfolioId)}>{p.PortfolioNr}</option>)}</select><ChevronDown size={14} /></label></section>
        {view !== 'cockpit' && <section className="metrics-row" aria-label="Customer snapshot"><Metric label="PORTFOLIO ASSETS" value={money(analysis.aum, analysis.currency)} detail={`${analysis.portfolios.length} portfolio${analysis.portfolios.length === 1 ? '' : 's'} in scope`} icon={<Wallet size={17} />} /><Metric label="REPORTED LIQUIDITY" value={money(analysis.liquidity, analysis.currency)} detail={analysis.aum && analysis.liquidity != null ? `${percent(analysis.liquidity/analysis.aum)} of reported assets` : 'Supplied snapshot value'} icon={<Layers3 size={17} />} /><Metric label="SECURITY POSITIONS" value={String(analysis.holdings.length)} detail={`${analysis.portfolios.reduce((sum, p) => sum + list(p.AccountPositions).length, 0)} account positions separately`} icon={<Database size={17} />} /><Metric label="RECORDED REVIEW POINTS" value={String(analysis.violations.length)} detail={analysis.violations.length ? 'Linked suitability findings' : 'None supplied in this scope'} icon={<ShieldCheck size={17} />} /></section>}
        <div className="view-bar"><div className="view-tabs" role="tablist" aria-label="Customer views">{viewOptions.map(option => <button key={option.id} id={`tab-${option.id}`} role="tab" aria-selected={option.id === activeTab(view)} aria-controls="customer-view" className={option.id === activeTab(view) ? 'active' : ''} onClick={() => { setView(option.id);  }}><option.icon size={16} />{option.title}</button>)}</div><span className="data-date"><Fingerprint size={13} />{latestFactory ? `Risk snapshot · ${dateLabel(latestFactory, true)}` : 'Supplied dataset snapshot'}</span></div>
        {activeTab(view) === 'brief' && <div className="workspace-switch" role="group" aria-label="Portfolio workspace pages">{workspaceViews.map(v=><button aria-pressed={view===v.id} key={v.id} onClick={()=>{setView(v.id); if(v.id==='graph'){setGraphOverview(true);setContextFocus('');}}}>{v.title}</button>)}</div>}
        <div id="customer-view" role="tabpanel" aria-labelledby={`tab-${activeTab(view)}`}>
          {view === 'cockpit' && <Cockpit key={`${customer.ClientId}:${scope}`} analysis={analysis} dataset={dataset} context={briefing.context} phase={briefing.phase} range={range} onRange={setRange} onEvidence={setEvidence} onNews={(id,name)=>{setNewsFocus({id,name});setView('brief');}} onWorkspace={() => setView('brief')} onRefresh={()=>void briefing.refresh()} />}
          <div hidden={view !== 'chat'}><AdvisorChat key={`${customer.ClientId}:${scope}`} analysis={analysis} context={briefing.context} phase={briefing.phase} onWorkspace={() => setView('brief')} onEvidence={setEvidence} onNews={(id,name)=>{setNewsFocus({id,name});setView('brief');}} onRefresh={()=>void briefing.refresh()}/></div>
          {view === 'brief' && <BriefOverview key={`${customer.ClientId}:${scope}`} range={range} onRange={setRange} newsFocus={newsFocus} onNewsFocus={setNewsFocus} analysis={analysis} briefing={briefing} onGraph={id => { setContextFocus(''); setSelectedId(id); setGraphOverview(false); setView('graph'); }} onContextGraph={id => { setContextFocus(id); setGraphOverview(true); setView('graph'); }} onEvidence={setEvidence} />}
          {view === 'information' && <><AttentionPanel key={`${customer.ClientId}:${scope}`} analysis={analysis} context={briefing.context} onEvidence={setEvidence} onGraph={id => { setContextFocus(''); setSelectedId(id); setGraphOverview(false); setView('graph'); }} onContextGraph={id => { setContextFocus(id); setGraphOverview(true); setView('graph'); }}/><InformationView analysis={analysis} dataset={dataset} onEvidence={setEvidence} /><ExposurePanel analysis={analysis} context={briefing.context} onEvidence={setEvidence} onNews={(id,name) => { setNewsFocus({id,name}); setView('brief'); }}/></>}
          <div hidden={view !== 'graph'}><CustomerGraph context={briefing.context} contextFocus={contextFocus} fundStatus={fundLookups.status} onRefreshFund={fundLookups.refresh} analysis={analysis} selected={selected} overview={graphOverview} onOverview={() => { setGraphOverview(true); setContextFocus(''); }} onSelect={id => { setContextFocus(''); setSelectedId(id); setGraphOverview(false); }} onEvidence={setEvidence} onBrief={() => setView('brief')} /></div>
        </div>
        {analysis.warnings.length > 0 && <details className="coverage-note"><summary><Info size={15} />{analysis.warnings.length} data coverage note{analysis.warnings.length === 1 ? '' : 's'}<ChevronDown size={14} /></summary>{analysis.warnings.map(w => <p key={w}>{w}</p>)}</details>}
        <footer className="page-footer"><span><ShieldCheck size={13} />Grounded in the supplied customer records</span><span>Case dates are shifted · External sources carry their own dates</span></footer>
      </main>
    </div>
    {evidence && <EvidenceDrawer evidence={evidence} onClose={closeEvidence} />}
  </div>;
}

function PlusSymbol() { return <span className="plus-symbol">+</span>; }
function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) { return <div className="metric"><div className="metric-label">{label}{icon}</div><strong>{value}</strong><span>{detail}</span></div>; }

function InformationView({ analysis, dataset, onEvidence }: { analysis: Analysis; dataset: Dataset; onEvidence: (e: Evidence) => void }) {
  const [query, setQuery] = useState(''); const [showAll, setShowAll] = useState(false);
  useEffect(() => { setQuery(''); setShowAll(false); }, [analysis]);
  const holdings = analysis.holdings.filter(h => h.name.toLowerCase().includes(query.toLowerCase()));
  const notesSource = (note: Row): Evidence => ({ id: `note-${note.CreatedByDateUTC}`, title: 'Recorded customer note', type: 'record', date: note.CreatedByDateUTC, location: `clients.json / ${analysis.customer.ClientRef} / ClientNotes`, fields: [{ label: 'Note', value: note.Note }], note: 'A supplied advisory note, not a conversation transcript. Dates in the export are shifted.' });
  return <div className="information-view"><div className="information-top"><section className="panel profile-panel"><div className="panel-heading"><h3>Customer profile</h3><Users size={17} /></div><dl><div><dt>Customer type</dt><dd>{analysis.customer.RegulatoryClientTypeName || 'Not recorded'}</dd></div><div><dt>Risk profile</dt><dd>{analysis.customer.RiskProfileName || 'Not recorded'}</dd></div><div><dt>ESG preference</dt><dd>{analysis.customer.EsgProfileName || 'Not recorded'}</dd></div><div><dt>Last profiling</dt><dd>{dateLabel(analysis.customer.ProfilingDateUtc, true)}</dd></div><div><dt>Proposal records</dt><dd>{analysis.proposals.length}</dd></div></dl><div className="profile-tags">{list(analysis.customer.Tags).map((t, i) => <span key={i}>{t.TagName}</span>)}</div></section><section className="panel"><div className="panel-heading"><h3>Portfolio-value history</h3><span className="subtle-badge">SOURCE OBSERVATIONS</span></div><HistoryChart analysis={analysis} large /></section></div>
    <section className="panel holdings-panel"><div className="panel-heading"><div><h3>What the customer owns <span className="inline-count">{analysis.holdings.length}</span></h3><p>Security positions in the selected scope. Click a row to inspect its source.</p></div><div className="table-search"><Search size={15} /><input aria-label="Search holdings" placeholder="Find a holding…" value={query} onChange={e => setQuery(e.target.value)} /></div></div><div className="table-scroll"><table><thead><tr><th>SECURITY / INSTRUMENT</th><th>CLASSIFICATION</th><th>PORTFOLIO</th><th className="numeric">VALUE</th><th className="numeric">SCOPE WEIGHT</th><th /></tr></thead><tbody>{(showAll ? holdings : holdings.slice(0, 8)).map(h => <tr key={h.id}><td><button className="holding-name" onClick={() => onEvidence(h.evidence)}><span className={`instrument-icon ${h.asset === 'Shares' ? 'equity' : ''}`}><Layers3 size={15} /></span><span>{h.displayName}<small>{h.known ? `Security ${h.securityId}` : 'Reference unavailable'}</small></span></button></td><td><span className="asset-tag">{instrumentLabel(h.instrumentType)}</span></td><td>{h.portfolio}</td><td className="numeric">{money(h.value, h.currency)}</td><td className="numeric weight-cell"><span>{analysis.weightsAvailable ? percent(h.weight) : '—'}</span><i style={{ width: `${Math.min(h.weight*200,80)}px` }} /></td><td><button className="icon-button" aria-label={`View source for ${h.name}`} onClick={() => onEvidence(h.evidence)}><ArrowUpRight size={15} /></button></td></tr>)}</tbody></table>{!holdings.length && <div className="empty-state"><Database size={24} /><h3>{query ? 'No matching holdings' : 'No security positions supplied'}</h3><p>{query ? 'Try a different instrument name.' : 'Account balances may still be available in this portfolio.'}</p></div>}</div>{holdings.length > 8 && <button className="table-expand" onClick={() => setShowAll(s => !s)}>{showAll ? 'Show fewer positions' : `View all ${holdings.length} positions`}<ChevronDown size={14} /></button>}</section>
    <div className="information-bottom"><section className="panel"><div className="panel-heading"><h3>Customer notes <span className="inline-count">{analysis.notes.length}</span></h3><FileText size={17} /></div><div className="notes-list">{analysis.notes.map((n, i) => <button key={i} onClick={() => onEvidence(notesSource(n))}><span className="timeline-dot" /><div><span className="eyebrow">{dateLabel(n.CreatedByDateUTC, true)}</span><p>{n.Note}</p></div><ArrowUpRight size={14} /></button>)}{!analysis.notes.length && <p className="muted">No customer notes were supplied.</p>}</div></section><section className="panel"><div className="panel-heading"><h3>Advisory history <span className="inline-count">{analysis.proposals.length}</span></h3><BookOpen size={17} /></div><div className="proposal-list">{analysis.proposals.slice(0, 6).map((p, i) => <button key={i} onClick={() => onEvidence({ id: `proposal-${p.ProposalId}`, title: p.Reason || 'Investment proposal', type: 'record', location: `clients.json / ${analysis.customer.ClientRef} / Proposals[ProposalId=${p.ProposalId}]`, date: p.ProposedDateUTC, fields: [{ label: 'Status', value: statusLabel(p.ProposalStatusName) }, { label: 'Proposed', value: dateLabel(p.ProposedDateUTC) }, { label: 'Portfolio ID', value: String(p.PortfolioId) }], note: 'Proposal status does not establish trade execution or explain why a proposal was rejected.' })}><div><strong>{p.Reason || 'Investment proposal'}</strong><span>{dateLabel(p.ProposedDateUTC, true)}</span></div><span className={`status-pill ${p.ProposalStatusName === 'Abgelehnt' ? 'rejected' : p.ProposalStatusName === 'Entwurf' ? 'draft' : ''}`}>{statusLabel(p.ProposalStatusName)}</span></button>)}{!analysis.proposals.length && <p className="muted">No linked proposals were supplied.</p>}{analysis.proposals.length > 6 && <p className="microcopy">Showing the six latest dated proposals.</p>}</div></section></div>
    <div className="information-bottom"><section className="panel"><div className="panel-heading"><h3>Account positions</h3><Wallet size={17} /></div><div className="account-list">{analysis.portfolios.flatMap(p => list(p.AccountPositions).map((a, i) => <button key={`${p.PortfolioId}-${i}`} onClick={() => onEvidence({ id: `account-${p.PortfolioId}-${i}`, title: `${a.Currency || 'Unspecified'} account position`, type: 'record', location: `clients.json / ${analysis.customer.ClientRef} / Portfolios[PortfolioId=${p.PortfolioId}] / AccountPositions[${i}]`, fields: [{ label: 'Account currency or ticker', value: a.Currency || 'Not recorded' }, { label: 'Value in portfolio currency', value: money(number(a.TotalAmountInPortfolioCurrency), p.PortfolioCurrency || analysis.currency) }, { label: 'Portfolio weight', value: number(a.PortfolioValuePercentage) != null ? percent(a.PortfolioValuePercentage) : 'Not available' }], note: 'Some exported account positions represent crypto or other non-fiat assets. Account identifiers are excluded.' })}><span className="account-symbol">{a.Currency || '—'}</span><div><strong>{p.PortfolioNr}</strong><span>Reported account position</span></div><b>{money(number(a.TotalAmountInPortfolioCurrency), p.PortfolioCurrency || analysis.currency)}</b><ArrowUpRight size={14} /></button>))}{!analysis.portfolios.some(p => list(p.AccountPositions).length) && <p className="muted">No account positions supplied.</p>}</div><p className="microcopy">Currencies and crypto tickers are preserved. Not every account position represents available fiat cash.</p></section><section className="panel"><div className="panel-heading"><h3>Recorded review points <span className="inline-count">{analysis.violations.length}</span></h3><ShieldCheck size={17} /></div><div className="issues-list">{analysis.violations.map((v, i) => <button key={`${v.Id}-${i}`} onClick={() => onEvidence({ id: `issue-${v.Id}`, title: v.RuleCode || 'Recorded issue', type: 'record', location: `clients.json / ${analysis.customer.ClientRef} / SuitabilityViolations[Id=${v.Id}]`, date: v.LastViolatedDateUTC, fields: [{ label: 'Rule', value: v.RuleCode || 'Not recorded' }, { label: 'Supplied severity', value: v.Severity || 'Not recorded' }, { label: 'Portfolio ID', value: String(v.PortfolioId) }], note: 'This finding is supplied by the source system and has not been recomputed.' })}><span className={`issue-dot ${v.Severity === 'Error' ? 'error' : ''}`} /><span>{v.RuleCode}<small>{v.Severity || 'Severity not recorded'}</small></span><ArrowUpRight size={14} /></button>)}{!analysis.violations.length && <p className="muted">No linked suitability issues were supplied. This is not a new suitability assessment.</p>}</div></section></div>
    <section className="panel portfolio-details"><div className="panel-heading"><h3>Portfolio details & recorded targets</h3><SlidersHorizontal size={17} /></div>{analysis.portfolios.map(p => { const saa = dataset.reference.StrategicAssetAllocations.find(s => s.Id === p.StrategicAssetAllocationId); const targets = list(saa?.Mappings).filter(m => m.Dimension === 'AssetClass' && number(m.TargetPercentage) != null); return <div key={p.PortfolioId} className="portfolio-detail-row"><div><h4>{p.PortfolioNr}</h4><p>{p.InvestmentServiceName || 'Service not recorded'} · {p.StrategyName || 'Strategy not recorded'}</p><button className="text-button" onClick={() => { const source = analysis.evidence.find(e => e.id === `p-${p.PortfolioId}`); if (source) onEvidence(source); }}>View supplied risk figures<ArrowUpRight size={13} /></button></div><div className="target-tags">{targets.map((t, i) => <button key={i} onClick={() => onEvidence({ id: `target-${saa!.Id}-${i}`, title: `${t.Category} allocation target`, type: 'record', location: `reference.json / StrategicAssetAllocations[Id=${saa!.Id}] / Mappings`, fields: [{ label: 'Category', value: t.Category }, { label: 'Target', value: percent(t.TargetPercentage) }, { label: 'Minimum', value: number(t.MinPercentage) != null ? percent(t.MinPercentage) : 'Not supplied' }, { label: 'Maximum', value: number(t.MaxPercentage) != null ? percent(t.MaxPercentage) : 'Not supplied' }], note: 'A supplied policy target. It has not been compared to incompatible fund or classification taxonomies.' })}>{t.Category}<strong>{percent(t.TargetPercentage)}</strong></button>)}{!targets.length && <span>No asset-class targets supplied</span>}</div></div>; })}<p className="microcopy">Targets are supplied policy values, not recommendations. Current fund look-through and target taxonomies are not silently equated.</p></section>
  </div>;
}
