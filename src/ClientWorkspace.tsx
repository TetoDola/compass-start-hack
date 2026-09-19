import { useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, FileText, Network, Rss, AlertCircle, UserRound } from 'lucide-react';
import { NewsThumbnail } from './NewsThumbnail';
import { ClientBrief } from './ClientBrief';
import { aggregateProducts, productEvidence, lookThrough } from './lib/advisory';
import type { Analysis, Evidence } from './lib/types';
import type { TimeRange, AttentionItem } from './lib/portfolio';
import type { useBriefing } from './useBriefing';
import { getAttentionItems, PerformancePanel, ExposurePanel } from './PortfolioOverview';
import { dateLabel, money, percent } from './lib/format';
import { COLORS } from './lib/colors';
import { contextEvidence, newsTargets } from './lib/briefing';
import { rankedNews } from './MarketNewsPanel';

export function ClientWorkspace({ analysis, briefing, range, onRange, onEvidence, onGraph, onFinding, onNewsGraph, onNews, onRecords }: { analysis: Analysis; briefing: ReturnType<typeof useBriefing>; range: TimeRange; onRange: (r: TimeRange) => void; onEvidence: (e: Evidence) => void; onGraph: (node?: string) => void; onFinding: (id: string) => void; onNewsGraph: (id: string) => void; onNews: (id?: string, name?: string) => void; onRecords: () => void }) {
  const [allIssues, setAllIssues] = useState(false), [issueId, setIssueId] = useState<string | null>(null), [allPositions, setAllPositions] = useState(false);
  const products = aggregateProducts(analysis), items = getAttentionItems(analysis, briefing.context);
  const news = rankedNews((briefing.context?.items || []).filter(i => i.kind === 'news')).slice(0, 6);
  const targets = newsTargets(analysis);
  function trace(item: AttentionItem) {
    if (item.contextId) onNewsGraph(item.contextId);
    else if (item.graphNodeId) onGraph(item.graphNodeId);
    else if (item.findingId && item.findingId !== 'customer-context') onFinding(item.findingId);
  }
  const allocations = analysis.weightsAvailable ? analysis.allocations.filter(a => a.weight > 0).slice(0, 3) : [];
  return <div className="client-workspace"><div className="ws-main-column">
    <div className="ws-decision-grid">
      <ClientBrief analysis={analysis} briefing={briefing} onEvidence={onEvidence} onNews={() => onNews()}/>
      <section className="ws-review ws-client-state" aria-label="Client and portfolio context">
        <div className="ws-section-heading"><h2><UserRound size={15}/>Client & portfolio</h2><button className="ws-icon" aria-label="Open customer records" onClick={onRecords}><ArrowUpRight size={14}/></button></div>
        <div className="ws-conversation"><h3><UserRound size={13}/>Investor profile</h3><p>{analysis.customer.RiskProfileName || analysis.strategy || 'Profile not supplied'}</p><span className="ws-note">{analysis.customer.IsClientACompany === true ? 'Company' : analysis.customer.IsClientACompany === false ? 'Private client' : 'Client type not supplied'} · {analysis.customer.ReportingCurrency || analysis.currency}</span>{analysis.customer.EsgProfileName && <p className="ws-note">ESG: {analysis.customer.EsgProfileName}</p>}<button className="ws-note-source" onClick={onRecords}>Client records<ArrowUpRight size={12}/></button></div>
        <div className="ws-allocation"><h3>Portfolio composition</h3>{allocations.length ? <><div className="ws-allocation-bar" aria-hidden="true">{allocations.map((a, i) => <span key={a.label} style={{width:`${Math.min(100,a.weight * 100)}%`,background:['var(--allocation-one)','var(--allocation-two)','var(--allocation-three)'][i]}}/>)}</div>{allocations.map((a,i)=><div className="ws-allocation-row" key={a.label}><i style={{background:['var(--allocation-one)','var(--allocation-two)','var(--allocation-three)'][i]}}/><span>{a.label}</span><strong>{percent(a.weight,1)}</strong></div>)}<small>Largest supplied asset classes</small></> : <p className="ws-note">{analysis.scopeAmbiguous?'Select a portfolio to see composition.':'Allocation data unavailable.'}</p>}</div>
        <div className="ws-review-heading"><h3><AlertCircle size={13}/>Review points <span>{items.length}</span></h3><span>Verify status</span></div>
        <div className="ws-priority-list">{(allIssues ? items : items.slice(0, 1)).map((item, index) => <div key={item.id} className={`ws-priority ${item.level} ${issueId === item.id ? 'is-open' : ''}`}>
          <button className="ws-priority-summary" onClick={() => setIssueId(issueId === item.id ? null : item.id)} aria-expanded={issueId === item.id}>
            <span className="ws-priority-number">{String(index + 1).padStart(2, '0')}</span><span className="ws-priority-copy"><span className="ws-priority-label">{item.contextId ? 'Headline · verify' : item.level === 'gap' ? 'Missing information' : item.evidence.some(e => e.type === 'calculation') ? 'Calculated · review' : 'Recorded · review'}</span><strong>{item.title}</strong><small>{item.metric || item.label}</small></span><ChevronRight size={15}/>
          </button>
          {issueId === item.id && <div className="ws-priority-detail"><p>{item.detail}</p><p><b>Next:</b> {item.action}</p><div className="ws-inline-actions">{item.evidence[0] && <button onClick={() => onEvidence(item.evidence[0])}><FileText size={13}/>Evidence</button>}{(item.contextId || item.graphNodeId || (item.findingId && item.findingId !== 'customer-context')) && <button onClick={() => trace(item)}><Network size={13}/>Trace exposure</button>}</div>{item.evidence.length > 1 && <details className="ws-disclosure"><summary>All {item.evidence.length} source records</summary>{item.evidence.map(e => <button className="ws-link" key={e.id} onClick={() => onEvidence(e)}>{e.title} · {e.id}<ArrowUpRight size={12}/></button>)}</details>}</div>}
        </div>)}</div>
        {!items.length && <p className="ws-note">No issue flagged by available checks. Coverage may be incomplete.</p>}
        {items.length > 1 && <button className="ws-show-more" onClick={() => setAllIssues(!allIssues)}>{allIssues ? 'Show leading point' : `View all ${items.length} review themes`}<ChevronDown size={13}/></button>}
      </section>
    </div>
    <div className="ws-analysis-grid">
      <section className="ws-card ws-holdings" aria-label="Positions by weight"><div className="ws-section-heading"><h2>Positions <span>{products.length}</span></h2><span className="ws-subtitle">Largest first</span></div>
        <div className="ws-holding-heading"><span>Investment</span><span>Value</span><span>Weight</span><span className="visually-hidden">Trace exposure</span></div>
        {(allPositions ? products : products.slice(0, 5)).map(p => { const h = p.positions[0]; return <div className="ws-holding-row" key={p.id}>
          <button className="ws-holding-name" onClick={() => onEvidence(productEvidence(analysis, p))}><i style={{ background: h.instrumentType === 'Investment fund' ? COLORS.fund : COLORS.company }}/><span>{p.name}<small>{lookThrough(h).label}{p.positions.length > 1 ? ` · ${p.positions.length} positions` : ''}</small></span></button>
          <span className="ws-holding-value">{analysis.scopeAmbiguous ? '—' : money(p.value, p.currency)}</span><span className="ws-holding-weight"><strong>{analysis.weightsAvailable ? percent(p.weight, 1) : '—'}</strong>{analysis.weightsAvailable && <i><span style={{width: `${Math.min(100, p.weight * 100)}%`}}/></i>}</span><button className="ws-icon" aria-label={`Explore ${h.displayName} in graph`} title="Trace exposure" onClick={() => onGraph(p.id)}><Network size={15}/></button>
        </div>; })}
        {!analysis.holdings.length && <p className="ws-note">No security positions supplied.</p>}
        {products.length > 5 && <button className="ws-show-more" onClick={() => setAllPositions(!allPositions)}>{allPositions ? 'Show top 5' : `View all ${products.length} positions`}<ChevronDown size={13}/></button>}
        <p className="ws-card-note">Same-ISIN positions combined. Cash is separate.</p>
      </section>
      <ExposurePanel analysis={analysis} context={briefing.context} onEvidence={onEvidence} onNews={onNews}/>
    </div>
    <PerformancePanel analysis={analysis} range={range} onRange={onRange}/>
  </div>
  <aside className="ws-right-column">
    <section className="ws-card ws-relevant-news" aria-label="Portfolio news feed"><div className="ws-section-heading"><h2><Rss size={14}/>Portfolio wire</h2><button className="ws-link" onClick={() => onNews()}>All news<ArrowUpRight size={13}/></button></div>
      <div className="ws-wire-status"><i/>{briefing.phase ? 'Checking sources…' : briefing.context ? `${briefing.context.checked}/${briefing.context.requested} searches checked` : 'News not checked'}<span>Current news</span></div>
      <div className="ws-feed-stories" tabIndex={0} role="region" aria-label="Latest portfolio headlines">{news.map(item => {
        const linked = targets.filter(t => item.entityIds.includes(t.id));
        return <article className="ws-news-preview" key={item.id}>
          <div className="ws-news-exposure"><button onClick={() => onNewsGraph(item.id)} title="Trace linked exposure">{linked[0]?.name || 'Portfolio context'}{linked.length > 1 ? ` +${linked.length - 1}` : ''}<ArrowUpRight size={11}/></button><span>{item.exposureWeight != null ? `${percent(item.exposureWeight, 2)} linked` : 'Weight unknown'}</span></div>
          <div className="ws-news-headline"><h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3><NewsThumbnail item={item}/></div>
          <div className="ws-news-meta"><span>{item.source}</span><time>{dateLabel(item.publishedAt, true)}</time></div>
          <div className="ws-news-source"><small>{item.provider}</small><button className="ws-icon" aria-label={`View relevance for ${item.title}`} onClick={() => onEvidence(contextEvidence(item))}><FileText size={13}/></button></div>
        </article>;
      })}</div>
      {!news.length && <p className="ws-empty">{briefing.phase ? 'Finding news connected to this portfolio…' : 'No matching headlines returned for this period.'}</p>}
      <div className="ws-wire-footer">Linked exposure ≠ measured impact.</div>
    </section>
    <div className="ws-quality-note"><details className="ws-disclosure"><summary>Data coverage & sources</summary><p>Case dates are shifted. Current news does not explain historical portfolio movement.</p>{analysis.warnings.map(w => <p key={w}>{w}</p>)}<p>Fund company coverage uses published top holdings. Missing exposure is unknown, not zero.</p></details></div>
  </aside></div>;
}
