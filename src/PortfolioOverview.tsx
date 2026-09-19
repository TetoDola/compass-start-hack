import { clientName } from './lib/format';
import { useState } from 'react';
import { AlertTriangle, ArrowUpRight, FileText } from 'lucide-react';
import type { Analysis, Evidence } from './lib/types';
import type { MarketContext } from './lib/briefing';
import { contextEvidence, newsTargets } from './lib/briefing';
import { portfolioAttention, portfolioExposures, periodPerformance, ranges, type TimeRange, type ExposureKind, type AttentionItem } from './lib/portfolio';
import { materialEvent } from './lib/events';
import { COLORS, dimensionColor } from './lib/colors';
import { dateLabel, money, percent } from './lib/format';
import { HistoryChart } from './components';
import { enrichRelevance } from './lib/research';

export function RangeControl({ value, onChange, label }: { value: TimeRange; onChange: (r: TimeRange) => void; label: string }) {
  return <div className="range-control" role="group" aria-label={label}>{ranges.map(r => <button key={r} aria-pressed={r === value} onClick={() => onChange(r)}>{r}</button>)}</div>;
}
export function PerformancePanel({ analysis, range, onRange }: { analysis: Analysis; range: TimeRange; onRange: (r: TimeRange) => void }) {
  const p = periodPerformance(analysis, range);
  return <section className="panel performance-panel"><div className="panel-heading"><div><span className="eyebrow">HOW THE PORTFOLIO HAS CHANGED</span><h3>Value change · not return</h3></div><RangeControl value={range} onChange={onRange} label="Portfolio history period"/></div>
    <div className="period-result"><strong className={p.change == null ? 'neutral' : p.change < 0 ? 'negative' : 'positive'}>{p.change == null ? 'Not available' : `${p.change >= 0 ? '+' : '−'}${percent(Math.abs(p.change))}`}</strong><div>{p.amount != null ? <><b>{p.amount >= 0 ? '+' : '−'}{money(Math.abs(p.amount), analysis.historyCurrency)}</b><span>{dateLabel(p.start!.date, true)} → {dateLabel(p.end!.date, true)}</span></> : <span>{analysis.scopeAmbiguous ? 'Select one portfolio to resolve overlapping assets.' : `No matching ${range} start/end observations. The supplied history is monthly.`}</span>}</div></div>
    {p.available ? <HistoryChart analysis={{ ...analysis, history: p.points }} large/> : <p className="microcopy">{p.end ? `Latest supplied value: ${money(p.end.value, analysis.historyCurrency)} on ${dateLabel(p.end.date, true)}. No interpolated returns.` : 'No compatible portfolio-value history supplied.'}</p>}
    <p className="microcopy">Case timeline, ending at the latest supplied observation. Value changes include possible cash flows; holding-level returns and performance attribution are unavailable.</p>
  </section>;
}
export function getAttentionItems(analysis: Analysis, context?: MarketContext): AttentionItem[] {
  const targets = newsTargets(analysis);
  const enriched=context?enrichRelevance(context,targets):undefined;
  const events: AttentionItem[] = (enriched?.items || []).filter(i => i.kind === 'news' && !i.sample && materialEvent(i.title) && i.entityIds.some(id => targets.some(t => t.id === id && (!t.kind || t.kind === 'company')))).map(item => {
    const linked = targets.filter(t => item.entityIds.includes(t.id) && (!t.kind || t.kind === 'company'));
    const weight = item.exposureWeight ?? null;
    return { id: item.id, contextId: item.id, level: materialEvent(item.title)!.severity, label: materialEvent(item.title)!.label, title: item.title, metric: weight == null ? 'Exposure unavailable' : `${percent(weight, 2)} linked exposure`, detail: `${linked.map(t => t.name).join(', ')} · ${item.source} · ${dateLabel(item.publishedAt, true)}. Name-matched headline; verify the affected entity and event.`, action: 'Open the article, verify the event and review the linked positions even if the total portfolio value rose.', evidence: [contextEvidence(item)] };
  });
  const rank = { critical: 0, review: 1, gap: 2 };
  return [...events, ...portfolioAttention(analysis)].sort((a,b) => (a.id === 'scope' ? -1 : rank[a.level])-(b.id === 'scope' ? -1 : rank[b.level]));
}
export function AttentionPanel({ analysis, context, onEvidence, onGraph, onContextGraph }: { analysis: Analysis; context?: MarketContext; onEvidence: (e: Evidence) => void; onGraph: (id: string) => void; onContextGraph: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const items = getAttentionItems(analysis, context);
  const visible = all ? items : items.slice(0,3);
  return <section className="attention-panel" aria-label="Portfolio attention overview"><div className="attention-heading"><div><span className="eyebrow">START HERE</span><h2>What needs attention?</h2><p>{items.length ? `${items.length} review themes. Start with the highest priority.` : 'No issue flagged by the available checks. This is not a clean bill of health.'}</p></div><AlertTriangle size={25}/></div>
    <div className="status-legend"><span className="critical">● Priority review</span><span className="review">● Check / reconfirm</span><span className="gap">● Missing information</span></div>
    <div className="attention-list">{visible.map((item,i) => <article className={`attention-item ${item.level}`} key={item.id}><span className="attention-number">{String(i+1).padStart(2,'0')}</span><div><span className="attention-label">{item.label}</span><h3>{item.title}</h3>{item.metric && <strong className="attention-metric">{item.metric}</strong>}<p>{item.detail}</p><p className="attention-action"><b>Next:</b> {item.action}</p><div className="sentence-links">{item.evidence[0] && <button onClick={() => onEvidence(item.evidence[0])}><FileText size={12}/>Inspect evidence{item.evidence.length > 1 ? ` (${item.evidence.length} records)` : ''}</button>}{item.contextId ? <button onClick={() => onContextGraph(item.contextId!)}>Trace affected holding ↗</button> : item.findingId && item.findingId !== 'customer-context' && <button onClick={() => onGraph(item.findingId!)}>See connections ↗</button>}</div>{all && item.evidence.length > 1 && <details><summary>All recorded sources</summary>{item.evidence.map(e => <button className="text-button" key={e.id} onClick={() => onEvidence(e)}>{e.title} · {e.id} ↗</button>)}</details>}</div></article>)}</div>
    {items.length > 3 && <button className="attention-more" onClick={() => setAll(!all)}>{all ? 'Show top priorities' : `Show all ${items.length} review themes`} <ArrowUpRight size={14}/></button>}
    <p className="attention-coverage">{context ? `${context.checked}/${context.requested} exposure news searches complete.` : 'News screening is in progress.'} Recorded breaches use the supplied case snapshot. News flags remain visible regardless of aggregate performance; headline screening is not exhaustive.</p>
  </section>;
}
export function CustomerIdentity({ analysis }: { analysis: Analysis }) {
  const need = analysis.findings.find(f => f.id === 'customer-context');
  return <section className="panel crm-overview"><span className="eyebrow">WHO IS THIS CUSTOMER?</span><h3>{clientName(analysis.customer)} · {analysis.customer.IsClientACompany === true ? 'Company' : analysis.customer.IsClientACompany === false ? 'Private client' : 'Customer'}</h3><p>{analysis.strategy}. {analysis.customer.RiskProfileName ? `Risk profile: ${analysis.customer.RiskProfileName}.` : 'Risk profile not supplied.'} {analysis.customer.EsgProfileName ? `ESG: ${analysis.customer.EsgProfileName}.` : ''}</p>{need && <p className="customer-need">{need.body}</p>}<div className="profile-tags">{(analysis.customer.Tags || []).slice(0,6).map((t: any,i: number) => <span key={i}>{t.TagName}</span>)}</div></section>;
}
export function ExposurePanel({ analysis, context, onEvidence, onNews }: { analysis: Analysis; context?: MarketContext; onEvidence: (e: Evidence) => void; onNews: (id: string, name: string) => void }) {
  const [kind,setKind] = useState<ExposureKind>('industry');
  const [all,setAll] = useState(false);
  const rows = portfolioExposures(analysis, kind);
  const total = rows.reduce((n,r)=>n+r.weight,0), securityWeight = analysis.holdings.reduce((n,h)=>n+h.weight,0);
  return <section className="panel exposure-panel"><div className="panel-heading"><div><span className="eyebrow">WHERE THE MONEY IS EXPOSED</span><h3>Exposure breakdown</h3></div></div><div className="exposure-tabs" role="group" aria-label="Exposure dimension">{(['industry','country','company','region'] as const).map(k => <button key={k} aria-pressed={k===kind} onClick={() => {setKind(k);setAll(false);}} style={{ '--dimension': dimensionColor(k) } as React.CSSProperties}><i/>{k === 'region' ? 'Fund regions' : k}</button>)}</div>
    {!analysis.weightsAvailable ? <p className="muted">Choose a non-overlapping portfolio to calculate weights.</p> : <><p className="exposure-coverage"><strong>{percent(total)}</strong> of portfolio attributed</p><details className="ws-disclosure ws-exposure-method"><summary>Coverage & methodology</summary><p>{kind==='company' ? 'Direct equity + published top 10 equity-fund holdings, joined by ISIN.' : kind==='country' ? 'Reference country for direct securities + country-specific fund categories. Broad regions are not guessed.' : kind==='industry' ? 'Direct classifications + supplied fund industry breakdowns.' : 'Supplied fund regions only; separate from the country table.'}</p></details>
    <div className="exposure-rows">{(all ? rows : rows.slice(0,7)).map(r => <div className="exposure-row" key={r.id}><button className="exposure-name" onClick={() => onEvidence(r.evidence[0])}>{r.name}<small>{r.via.length} contributing position{r.via.length===1?'':'s'}</small></button><div className="exposure-bar"><span style={{ width: `${Math.min(100,r.weight*100)}%`, background: dimensionColor(kind) }}/></div><strong>{percent(r.weight,1)}</strong><button className="news-link" onClick={() => onNews(r.id,r.name)}>News{context?.items.some(i=>i.entityIds.includes(r.id)) ? ` (${context.items.filter(i=>i.entityIds.includes(r.id)).length})` : ''} ↗</button></div>)}</div>{!rows.length && <p className="muted">No classified exposure available for this dimension.</p>}{rows.length>7 && <button className="text-button" onClick={() => setAll(!all)}>{all ? 'Show top 7' : `Show all ${rows.length}`}</button>}
    <p className="microcopy">{kind !== 'region' && `${percent(Math.max(0,securityWeight-total))} of security-position weight is not attributed in this view. `}Weights use the whole selected portfolio as denominator. Cash and other accounts are separate. {kind==='company' && 'Commodity, property and bond products require other risk lenses. Share classes remain separate; fund dates may differ from positions.'}</p></>}
  </section>;
}
export function PositionsPanel({ analysis, onEvidence }: { analysis: Analysis; onEvidence: (e: Evidence) => void }) {
  const [all,setAll] = useState(false);
  return <section className="panel positions-panel"><div className="panel-heading"><div><span className="eyebrow">LARGEST FIRST</span><h3>Positions by weight</h3></div><span className="subtle-badge">{analysis.holdings.length} POSITIONS</span></div><div className="position-list">{(all ? analysis.holdings : analysis.holdings.slice(0,6)).map(h => <button key={h.id} onClick={() => onEvidence(h.evidence)}><i style={{ background: h.instrumentType === 'Investment fund' ? COLORS.fund : COLORS.company }}/><span>{h.displayName}<small>{h.instrumentType} · {h.portfolio}</small></span><strong>{analysis.weightsAvailable ? percent(h.weight) : '—'}</strong></button>)}</div>{analysis.holdings.length>6 && <button className="text-button" onClick={()=>setAll(!all)}>{all?'Show top 6':`Show all ${analysis.holdings.length} positions`}</button>}<p className="microcopy">Source position weights; cash accounts are separate. Click a position for its value and source.</p></section>;
}
