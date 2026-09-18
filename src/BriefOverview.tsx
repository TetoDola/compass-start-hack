import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FileText, RefreshCw, Sparkles, X } from 'lucide-react';
import { contextEvidence, sections } from './lib/briefing';
import type { Analysis, Evidence } from './lib/types';
import type { TimeRange } from './lib/portfolio';
import type { useBriefing } from './useBriefing';
import { FindingCard } from './components';
import { dateLabel } from './lib/format';
import { materialEvent } from './lib/events';
import { AttentionPanel, CustomerIdentity, ExposurePanel, PerformancePanel, PositionsPanel, RangeControl } from './PortfolioOverview';

export function BriefOverview({ analysis, briefing, onGraph, onContextGraph, onEvidence, range, onRange, newsFocus, onNewsFocus }: {
  analysis: Analysis; briefing: ReturnType<typeof useBriefing>; onGraph: (id: string) => void; onContextGraph: (id: string) => void; onEvidence: (e: Evidence) => void;
  range: TimeRange; onRange: (r: TimeRange) => void; newsFocus: { id: string; name: string } | null; onNewsFocus: (v: { id: string; name: string } | null) => void;
}) {
  const [details, setDetails] = useState(false);
  const [allNews, setAllNews] = useState(false);
  const newsSection = useRef<HTMLElement>(null);
  useEffect(() => { if (newsFocus) newsSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setAllNews(false); }, [newsFocus]);
  const chosen = sections.flatMap(s => briefing.selection[s.id]).map(id => briefing.candidates.find(c => c.id === id)).filter(Boolean);
  const words = chosen.reduce((n, c) => n + c!.text.split(/\s+/).length, 0);
  const news = (briefing.context?.items || []).filter(i => !newsFocus || i.entityIds.includes(newsFocus.id)).sort((a,b) => Number(!!materialEvent(b.title))-Number(!!materialEvent(a.title)) || b.publishedAt.localeCompare(a.publishedAt));
  function source(id: string) { const evidence = analysis.evidence.find(e => e.id === id); const item = briefing.context?.items.find(i => i.id === id); if (evidence) onEvidence(evidence); else if (item) onEvidence(contextEvidence(item)); }
  return <>
    <AttentionPanel analysis={analysis} context={briefing.context} onEvidence={onEvidence} onGraph={onGraph} onContextGraph={onContextGraph}/>
    <div className="brief-layout portfolio-brief"><div className="brief-main">
      <PerformancePanel analysis={analysis} range={range} onRange={onRange}/>
      <section className="one-minute-brief"><div className="one-minute-heading"><div><span className="eyebrow">READY FOR THE CONVERSATION</span><h2>Your one-minute brief<span>.</span></h2></div><button className="button primary" disabled={!!briefing.phase} onClick={() => briefing.refresh()}><RefreshCw size={15} className={briefing.phase ? 'spin' : ''}/>{briefing.phase ? 'Preparing…' : 'Refresh brief'}</button></div><div className="brief-generation" role="status"><Sparkles size={14}/><span>{briefing.phase || briefing.message}</span><span>{briefing.elapsedMs != null ? `${(briefing.elapsedMs/1000).toFixed(1)}s · ` : ''}{words} words</span></div>
        <div className="brief-four">{sections.map((section, i) => <section key={section.id}><div className="brief-four-label"><span>{String(i+1).padStart(2, '0')}</span><h3>{section.title}</h3></div>{briefing.selection[section.id].map(id => { const c = briefing.candidates.find(c => c.id === id); if (!c) return null; return <div className="brief-sentence" key={id}><p>{c.text}</p><div className="sentence-links">{c.sourceIds.slice(0, 2).map((id, n) => <button key={id} onClick={() => source(id)}><FileText size={12}/>Source {n+1}</button>)}{c.findingId && c.findingId !== 'customer-context' && <button onClick={() => onGraph(c.findingId!)}>See connection <ArrowUpRight size={12}/></button>}{c.contextId && <button onClick={() => onContextGraph(c.contextId!)}>See connection <ArrowUpRight size={12}/></button>}</div></div>; })}</section>)}</div><div className="brief-footnote">Latest supplied interval and customer context. Current news has its own dates; it does not explain historical portfolio changes.</div>
      </section>
      <ExposurePanel analysis={analysis} context={briefing.context} onEvidence={onEvidence} onNews={(id,name) => onNewsFocus({id,name})}/>
      <button className="more-findings" onClick={() => setDetails(!details)}>{details ? 'Hide detailed findings' : `Inspect all ${analysis.findings.length} findings and calculations`} <ArrowUpRight size={15}/></button>{details && <div className="findings-grid">{analysis.findings.map(f => <FindingCard key={f.id} finding={f} selected={false} onSelect={() => {}} onGraph={() => onGraph(f.id)} onEvidence={onEvidence}/>)}</div>}
      <section ref={newsSection} className="panel context-panel" id="portfolio-news"><div className="panel-heading"><div><span className="eyebrow">CURRENT NEWS · SEPARATE FROM CASE HISTORY</span><h3>{newsFocus ? `News · ${newsFocus.name}` : 'News connected to this customer'}</h3><p>{briefing.context ? `${briefing.context.checked}/${briefing.context.requested} company, industry and geography searches complete` : 'Checking public feeds…'}</p></div></div><div className="news-filter-row"><RangeControl value={briefing.newsRange} onChange={briefing.setNewsRange} label="News publication period"/><span>Published within {briefing.newsRange === '1M' ? '30 days' : briefing.newsRange === '1Y' ? '365 days' : briefing.newsRange === '7D' ? '7 days' : '24 hours'} of today</span>{newsFocus && <button className="text-button" onClick={() => onNewsFocus(null)}><X size={13}/> All news</button>}</div>
        <div className="context-list">{(allNews ? news : news.slice(0,10)).map(item => <article key={item.id} className={materialEvent(item.title) ? 'event-news' : ''}><span className="eyebrow">{item.sample ? 'PUBLIC HOUSE-VIEW SAMPLE' : item.source} · {dateLabel(item.publishedAt, true)}</span>{materialEvent(item.title) && <span className="event-badge">{materialEvent(item.title)!.label}</span>}<h4><a href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a></h4><p>{item.relevance}</p><div className="sentence-links"><button onClick={() => onEvidence(contextEvidence(item))}>Inspect source</button><button onClick={() => onContextGraph(item.id)}>Trace connection ↗</button></div></article>)}{!news.length && <p className="muted">{briefing.phase ? 'This exposure is being screened; customer facts are already available.' : 'No matching headlines returned for this exposure and period. This does not mean there is no material event.'}</p>}</div>{news.length>10 && <button className="text-button" onClick={() => setAllNews(!allNews)}>{allNews ? 'Show top 10' : `Show all ${news.length} articles`}</button>}
        {briefing.context && <details className="context-coverage"><summary>Source coverage & limitations</summary>{briefing.context.warnings.map(w => <p key={w}>{w}</p>)}<p>Feeds: {briefing.context.providers.join(' · ') || 'None returned'}. Checked {dateLabel(briefing.context.fetchedAt, true)}. Headline rules flag events for review; no automated sentiment or price-impact estimate.</p></details>}
      </section>
    </div><aside className="brief-aside"><CustomerIdentity analysis={analysis}/><PositionsPanel analysis={analysis} onEvidence={onEvidence}/><section className="grounding-card"><Sparkles size={22}/><h3>Follow the exposure.</h3><p>Connect the customer to positions, underlying companies, industries, countries and source articles.</p><button className="text-button" onClick={() => onGraph(analysis.findings.find(f => f.id === 'fund-lookthrough')?.id || analysis.findings[0].id)}>Explore connections <ArrowUpRight size={14}/></button></section></aside></div>
  </>;
}
