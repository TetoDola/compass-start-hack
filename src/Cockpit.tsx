import { useId, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, FileText, Network, X } from 'lucide-react';
import { ClientAvatar } from './ClientAvatar';
import { CurrentPricesPanel } from './CurrentPricesPanel';
import { getAttentionItems } from './PortfolioOverview';
import { aggregateProducts, productEvidence, lookThrough, clientContextEvidence } from './lib/advisory';
import type { Analysis, Dataset, Evidence } from './lib/types';
import type { MarketContext } from './lib/briefing';
import { breakdownRows, portfolioEvents, riskContributors, type BreakdownRow } from './lib/cockpit';
import { periodPerformance, ranges, type AttentionItem, type ExposureKind, type TimeRange } from './lib/portfolio';
import { clientName, dateLabel, list, money, number, percent } from './lib/format';

type Tab = 'asset' | 'positions' | ExposureKind;
const dimensions: { kind: ExposureKind; title: string; note: string }[] = [
  { kind: 'country', title: 'Country', note: 'Direct reference countries, country-specific fund categories and classified published constituents. Broad regions are not assigned to countries.' },
  { kind: 'industry', title: 'Industry', note: 'Direct classifications and supplied fund industry breakdowns. Each fund is counted once within this dimension.' },
  { kind: 'company', title: 'Company', note: 'Direct equity and published fund constituents, joined by ISIN. Share classes remain separate; published top holdings can give partial coverage.' },
  { kind: 'region', title: 'Regions', note: 'Supplied broad regional classifications. They may overlap country coverage; these dimensions must not be added together.' },
];
const tabs: { kind: Tab; title: string }[] = [{ kind: 'asset', title: 'Asset class' }, { kind: 'positions', title: 'Positions' }, ...dimensions];
type Navigation = {
  onEvidence: (e: Evidence) => void; onNews: (id?: string, name?: string) => void;
  onGraph: (id?: string) => void; onFinding: (id: string) => void; onNewsGraph: (id: string) => void; onRecords: () => void;
};

export function Cockpit({ analysis, dataset, context, range, onRange, ...navigation }: {
  analysis: Analysis; dataset: Dataset; context?: MarketContext; range: TimeRange; onRange: (r: TimeRange) => void;
} & Navigation) {
  const [tab, setTab] = useState<Tab>('asset');
  const [focus, setFocus] = useState<{ kind: ExposureKind; id: string } | null>(null);
  const attention = useMemo(() => getAttentionItems(analysis, context), [analysis, context]);
  const rows = useMemo(() => Object.fromEntries(dimensions.map(d => [d.kind, breakdownRows(analysis, dataset, d.kind, context)])) as Record<ExposureKind, BreakdownRow[]>, [analysis, dataset, context]);
  const focused = focus ? rows[focus.kind]?.find(r => r.id === focus.id) : undefined;
  return <div className="cockpit" aria-label="Client cockpit">
    <div className="cockpit-top">
      <aside className="cockpit-left">
        <ClientRail analysis={analysis} onEvidence={navigation.onEvidence} onRecords={navigation.onRecords} />
        <NotesPanel analysis={analysis} onEvidence={navigation.onEvidence} onRecords={navigation.onRecords} />
      </aside>
      <div className="cockpit-centre">
        <section className="panel cockpit-portfolio" aria-label="Portfolio value and risk">
          <PerformanceCard analysis={analysis} range={range} onRange={onRange} />
          <RiskSection analysis={analysis} dataset={dataset} onEvidence={navigation.onEvidence} />
        </section>
        <section className="panel cockpit-exposures" aria-label="Portfolio exposure">
          <div className="cockpit-section-heading"><h2>Portfolio exposure</h2><button className="text-button" onClick={() => navigation.onGraph()}>View connections <ArrowUpRight size={13}/></button></div>
          <div className="cockpit-tabs" role="group" aria-label="Exposure dimension">{tabs.map(item => <button key={item.kind} aria-pressed={tab === item.kind} onClick={() => { setTab(item.kind); setFocus(null); }}>{item.title}</button>)}</div>
          {tab === 'asset' ? <AssetTable analysis={analysis} onEvidence={navigation.onEvidence} /> : tab === 'positions' ? <PositionsTable analysis={analysis} onEvidence={navigation.onEvidence} onGraph={navigation.onGraph} /> : <BreakdownSection key={tab} dimension={dimensions.find(d => d.kind === tab)!} rows={rows[tab]} analysis={analysis} focus={focus?.id} onFocus={id => setFocus(f => f?.id === id ? null : { kind: tab, id })} />}
          {focused && <Drilldown row={focused} analysis={analysis} context={context} onEvidence={navigation.onEvidence} onNews={navigation.onNews} onGraph={navigation.onGraph} onClose={() => setFocus(null)} />}
        </section>
      </div>
      <aside className="cockpit-right">
        <PromptRail prompts={attention} {...navigation} />
        <NewsPanel analysis={analysis} context={context} onEvidence={navigation.onEvidence} onNews={navigation.onNews} onNewsGraph={navigation.onNewsGraph} />
        <section className="panel cockpit-coverage" aria-label="Data coverage"><details><summary>Data coverage & sources <ChevronDown size={14}/></summary><p>Case dates are shifted. Current news does not explain historical portfolio movement.</p>{[...new Set([...analysis.warnings, ...(context?.warnings || [])])].map(warning => <p key={warning}>{warning}</p>)}<p>Fund company coverage uses published holdings. Missing exposure is unknown, not zero.</p><button className="text-button" onClick={navigation.onRecords}>Inspect source records <ArrowUpRight size={12}/></button></details></section>
      </aside>
    </div>
    <CurrentPricesPanel analysis={analysis}/>
  </div>;
}

function ClientRail({ analysis, onEvidence, onRecords }: { analysis: Analysis; onEvidence: Navigation['onEvidence']; onRecords: Navigation['onRecords'] }) {
  const customer = analysis.customer;
  const portfolio = analysis.portfolios.length === 1 ? analysis.portfolios[0] : undefined;
  const proposal = analysis.proposals[0];
  return <section className="panel cockpit-rail" aria-label="Client profile">
    <div className="cockpit-section-heading"><h2>Client profile</h2><button className="text-button" onClick={onRecords}>Records <ArrowUpRight size={12}/></button></div>
    <div className="client-identity-heading"><ClientAvatar client={customer}/><div><h3>{clientName(customer)}</h3><p>{customer.RegulatoryClientTypeName || 'Classification not recorded'}</p><span>{customer.ReportingCurrency || 'Currency not recorded'}</span></div></div>
    <dl className="cockpit-facts">
      <div><dt>Risk profile</dt><dd>{customer.RiskProfileName || 'Not recorded'}</dd></div>
      <div><dt>Service</dt><dd>{portfolio?.InvestmentServiceName || (analysis.portfolios.length ? 'Multiple portfolios' : 'Not recorded')}</dd></div>
      <div><dt>Strategy</dt><dd>{analysis.strategy}</dd></div>
      <div><dt>Last profiling</dt><dd>{dateLabel(customer.ProfilingDateUtc, true)}</dd></div>
      <div><dt>ESG preference</dt><dd>{customer.EsgProfileName || 'Not recorded'}</dd></div>
    </dl>
    <button className="text-button cockpit-profile-source" onClick={() => onEvidence(clientContextEvidence(analysis))}>Profile source <FileText size={12}/></button>
    {proposal && <div className="cockpit-rail-block"><span className="eyebrow">Latest proposal</span><strong className="cockpit-proposal">{proposal.Reason || 'Investment proposal'}</strong><span className="cockpit-rail-meta">{dateLabel(proposal.ProposedDateUTC, true)} · {proposal.ProposalStatusName || 'Status not recorded'}{list(proposal.SecurityPositions).length ? ` · ${list(proposal.SecurityPositions).length} proposed trades` : ''}</span></div>}
    <div className="cockpit-counters"><div><strong>{analysis.proposals.length}</strong><span>Proposals</span></div><div><strong>{analysis.holdings.length}</strong><span>Positions</span></div><div><strong>{analysis.violations.length}</strong><span>Recorded findings</span></div></div>
    {analysis.unresolved > 0 && <p className="microcopy">{analysis.unresolved} further advisory record{analysis.unresolved === 1 ? '' : 's'} reference a portfolio missing from this export and are excluded here.</p>}
  </section>;
}

function NotesPanel({ analysis, onEvidence, onRecords }: { analysis: Analysis; onEvidence: Navigation['onEvidence']; onRecords: Navigation['onRecords'] }) {
  const [all, setAll] = useState(false);
  return <section className="panel cockpit-notes" aria-label="Adviser notes"><div className="cockpit-section-heading"><h2>Notes <span>{analysis.notes.length}</span></h2><button className="text-button" onClick={onRecords}>View records <ArrowUpRight size={12}/></button></div>
    {(all ? analysis.notes : analysis.notes.slice(0, 3)).map((note, index) => { const source = analysis.evidence.find(e => e.id === `note-${index}`); return <article className="cockpit-note" key={index}><div><time>{dateLabel(note.CreatedByDateUTC, true)}</time>{source && <button aria-label={`Source for note dated ${dateLabel(note.CreatedByDateUTC, true)}`} onClick={() => onEvidence(source)}><FileText size={12}/></button>}</div><p>{note.Note}</p></article>; })}
    {!analysis.notes.length && <p className="muted">No customer notes supplied.</p>}
    {analysis.notes.length > 3 && <button className="text-button cockpit-show-more" onClick={() => setAll(value => !value)}>{all ? 'Show latest three' : `View all ${analysis.notes.length} notes`} <ChevronDown size={12}/></button>}
  </section>;
}

function PerformanceCard({ analysis, range, onRange }: { analysis: Analysis; range: TimeRange; onRange: (r: TimeRange) => void }) {
  const period = periodPerformance(analysis, range);
  const latest = analysis.history.at(-1);
  return <div className="cockpit-performance">
    <div className="cockpit-section-heading"><h2>Portfolio value</h2><div className="range-control" role="group" aria-label="Portfolio history period">{ranges.map(r => <button key={r} aria-pressed={r === range} onClick={() => onRange(r)}>{r}</button>)}</div></div>
    <div className="cockpit-value-heading"><strong>{latest ? money(latest.value, analysis.historyCurrency) : money(analysis.aum, analysis.currency)}</strong><span>{latest ? `Latest observation · ${dateLabel(latest.date, true)}` : 'Reported portfolio snapshot'}</span></div>
    <ValueChart points={analysis.history} from={period.startDate} currency={analysis.historyCurrency}/>
    <div className="cockpit-value-metrics"><div><strong className={period.change == null ? '' : period.change < 0 ? 'negative' : 'positive'}>{period.change == null ? 'Unavailable' : `${period.change >= 0 ? '+' : '−'}${percent(Math.abs(period.change))}`}</strong><span>Value change · {range}</span></div><div><strong>{period.amount == null ? '—' : `${period.amount >= 0 ? '+' : '−'}${money(Math.abs(period.amount), analysis.historyCurrency)}`}</strong><span>Change in value · {range}</span></div><div><strong>{analysis.history.length}</strong><span>Supplied observations</span></div></div>
    <details className="cockpit-method"><summary>Value movement includes cash flows; it is not investment return.</summary><p>The full supplied history is shown; the selected {range} window is marked. {period.start && period.end ? `${dateLabel(period.start.date, true)} to ${dateLabel(period.end.date, true)}.` : analysis.scopeAmbiguous ? 'Select one portfolio to resolve overlapping assets.' : `No matching ${range} start and end observations are available.`} Holding-level performance attribution is not available.</p>{analysis.history.length > 0 && <div className="cockpit-history-observations" tabIndex={0} role="region" aria-label="Historical portfolio values"><table><caption>All {analysis.history.length} supplied observations</caption><thead><tr><th scope="col">Date</th><th scope="col">Value ({analysis.historyCurrency})</th></tr></thead><tbody>{analysis.history.map(point => <tr key={point.date}><th scope="row">{dateLabel(point.date, true)}</th><td>{money(point.value, analysis.historyCurrency)}</td></tr>)}</tbody></table></div>}</details>
  </div>;
}

function ValueChart({ points, from, currency }: { points: { date: string; value: number }[]; from: string; currency: string }) {
  const gradientId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div className="cockpit-chart-empty"><span>History unavailable</span><p>No compatible portfolio-value series was supplied for this scope.</p></div>;
  const values = points.map(p => p.value), timestamps = points.map(p => new Date(p.date).getTime());
  const lowest = Math.min(...values), highest = Math.max(...values), padding = (highest - lowest || highest || 1) * .12;
  const min = lowest - padding, max = highest + padding;
  const width = 720, height = 218, left = 62, right = 16, top = 12, bottom = 32;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const elapsed = timestamps.at(-1)! - timestamps[0] || 1;
  const x = (time: number) => left + (time - timestamps[0]) / elapsed * plotWidth;
  const y = (value: number) => top + (max - value) / (max - min) * plotHeight;
  const coords = points.map((point, i) => [x(timestamps[i]), y(point.value)]);
  const path = coords.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
  const compact = (value: number) => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const fromTime = new Date(from).getTime(), markerX = Number.isFinite(fromTime) ? Math.max(left, Math.min(width - right, x(fromTime))) : left;
  const active = hover == null ? null : points[hover];
  const activeX = hover == null ? 0 : coords[hover][0];
  const dateIndexes = [...new Set([0, Math.round((points.length - 1) / 4), Math.round((points.length - 1) / 2), Math.round((points.length - 1) * 3 / 4), points.length - 1])];
  return <div className="cockpit-chart-wrap"><svg className="cockpit-chart" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${currency} portfolio values across ${points.length} observations, ${dateLabel(points[0].date, true)} to ${dateLabel(points.at(-1)!.date, true)}`} onPointerLeave={() => setHover(null)} onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); const px = (event.clientX - bounds.left) / bounds.width * width; let nearest = 0; coords.forEach((point, i) => { if (Math.abs(point[0] - px) < Math.abs(coords[nearest][0] - px)) nearest = i; }); setHover(nearest); }}>
    <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--allocation-one)" stopOpacity=".18"/><stop offset="100%" stopColor="var(--allocation-one)" stopOpacity=".025"/></linearGradient></defs>
    {[0, 1, 2, 3].map(index => { const value = min + (max - min) * index / 3; return <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="cockpit-chart-grid"/><text x={left - 10} y={y(value) + 4} textAnchor="end">{compact(value)}</text></g>; })}
    {dateIndexes.map(index => <g key={index}><line x1={coords[index][0]} x2={coords[index][0]} y1={top} y2={height - bottom} className="cockpit-chart-grid"/><text x={coords[index][0]} y={height - 10} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{new Date(points[index].date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</text></g>)}
    <rect x={markerX} y={top} width={width - right - markerX} height={plotHeight} className="cockpit-chart-window"/>
    <path d={`${path} L${width - right},${height - bottom} L${left},${height - bottom} Z`} fill={`url(#${gradientId})`}/>
    <path d={path} className="cockpit-chart-line"/>
    <circle cx={coords.at(-1)![0]} cy={coords.at(-1)![1]} r="4" className="cockpit-chart-end"/>
    {active && <g className="cockpit-chart-inspection"><line x1={activeX} x2={activeX} y1={top} y2={height - bottom}/><circle cx={activeX} cy={y(active.value)} r="4"/><rect x={Math.max(left, Math.min(width - 190, activeX - 88))} y={top + 2} width="174" height="39" rx="4"/><text x={Math.max(left, Math.min(width - 190, activeX - 88)) + 87} y={top + 18} textAnchor="middle">{money(active.value, currency)}</text><text x={Math.max(left, Math.min(width - 190, activeX - 88)) + 87} y={top + 33} textAnchor="middle">{dateLabel(active.date, true)}</text></g>}
  </svg></div>;
}

function RiskSection({ analysis, dataset, onEvidence }: { analysis: Analysis; dataset: Dataset; onEvidence: Navigation['onEvidence'] }) {
  const [all, setAll] = useState(false);
  const contributors = riskContributors(analysis);
  const portfolio = analysis.portfolios.length === 1 ? analysis.portfolios[0] : undefined;
  const volatility = number(portfolio?.Volatility), profile = dataset.reference.RiskProfiles.find(p => p.Id === analysis.customer.RiskProfileId), ceiling = number(profile?.MaxVola);
  const source = analysis.evidence.find(e => e.id === `p-${portfolio?.PortfolioId}`);
  return <div className="cockpit-risk"><div className="cockpit-section-heading"><h3>Risk contributors</h3>{contributors.length > 5 && <button className="text-button" onClick={() => setAll(value => !value)}>{all ? 'Show top five' : `View all ${contributors.length}`} <ChevronDown size={12}/></button>}</div>
    <div className="cockpit-risk-grid"><div>{contributors.length ? <div className="cockpit-risk-rows">{(all ? contributors : contributors.slice(0, 5)).map(holding => <button className="cockpit-risk-row" key={holding.id} onClick={() => onEvidence(holding.evidence)} title={`${holding.displayName}: ${percent(holding.weight)} portfolio weight`}><span>{holding.displayName}</span><i><b style={{width: `${Math.max(1, holding.riskContribution! / contributors[0].riskContribution! * 100)}%`}}/></i><strong>{percent(holding.riskContribution!, 2)}</strong></button>)}</div> : <p className="muted">No position risk-contribution figures supplied.</p>}<p className="microcopy">Supplied contributions to portfolio volatility, not profit and loss. Select a position to inspect its source.</p></div>
    <div className="cockpit-risk-summary"><span>Portfolio volatility</span><strong className={volatility != null && ceiling != null && volatility > ceiling ? 'negative' : ''}>{volatility == null ? '—' : percent(volatility)}</strong><small>{ceiling == null ? 'Profile ceiling not supplied' : `Profile ceiling ${percent(ceiling)}`}</small>{volatility != null && ceiling != null && ceiling > 0 && <div className="cockpit-gauge-track"><i className={volatility > ceiling ? 'over-limit' : ''} style={{width:`${Math.min(100, volatility / ceiling * 100)}%`}}/></div>}<dl><div><dt>Expected return</dt><dd>{number(portfolio?.ExpectedReturn) == null ? '—' : percent(portfolio!.ExpectedReturn)}</dd></div><div><dt>Value at risk</dt><dd>{number(portfolio?.ValueAtRisk) == null ? '—' : percent(portfolio!.ValueAtRisk)}</dd></div></dl>{source && <button className="text-button" onClick={() => onEvidence(source)}>Supplied snapshot <ArrowUpRight size={11}/></button>}{!portfolio && <small>Select one portfolio for risk figures.</small>}</div></div>
  </div>;
}

function AssetTable({ analysis, onEvidence }: { analysis: Analysis; onEvidence: Navigation['onEvidence'] }) {
  if (!analysis.weightsAvailable) return <p className="cockpit-empty">Select a non-overlapping portfolio to see allocation weights.</p>;
  const source: Evidence = { id: 'cockpit:asset-composition', title: 'Portfolio asset composition', type: 'calculation', location: 'Selected portfolio security positions and accounts / supplied portfolio weights', fields: analysis.allocations.map(row => ({label: row.label, value: percent(row.weight, 2)})), note: 'Uses supplied security and account weights in the selected scope. Asset labels are classifications, not policy targets.' };
  return <div className="cockpit-table-body"><div className="cockpit-asset-table" aria-label="Asset class allocation"><div className="cockpit-table-head"><span>Asset class</span><span>Allocation</span><span className="numeric">Weight</span></div>{analysis.allocations.map(row => <button className="cockpit-table-row" key={row.label} onClick={() => onEvidence(source)}><span>{row.label}</span><span className="cockpit-cell-bar"><i><b style={{width:`${Math.min(100, row.weight * 100)}%`}}/></i></span><strong className="numeric">{percent(row.weight, 1)}</strong></button>)}</div>{!analysis.allocations.length && <p className="muted">No asset-class allocation supplied.</p>}<p className="microcopy">Security and account weights from the selected snapshot. Select a row to inspect the calculation.</p></div>;
}

function PositionsTable({ analysis, onEvidence, onGraph }: { analysis: Analysis; onEvidence: Navigation['onEvidence']; onGraph: Navigation['onGraph'] }) {
  const [all, setAll] = useState(false), products = aggregateProducts(analysis);
  return <div className="cockpit-table-body"><div className="cockpit-position-table" aria-label="Positions by portfolio weight"><div className="cockpit-table-head"><span>Investment</span><span className="numeric">Value</span><span className="numeric">Weight</span><span className="visually-hidden">Connections</span></div>{(all ? products : products.slice(0, 6)).map(product => <div className="cockpit-table-row" key={product.id}><button className="cockpit-position-name" onClick={() => onEvidence(productEvidence(analysis, product))}><strong>{product.name}</strong><small>{lookThrough(product.positions[0]).label}{product.positions.length > 1 ? ` · ${product.positions.length} positions` : ''}</small></button><span className="numeric">{analysis.scopeAmbiguous ? '—' : money(product.value, product.currency)}</span><strong className="numeric">{analysis.weightsAvailable ? percent(product.weight, 1) : '—'}</strong><span><button className="ws-icon" aria-label={`Explore ${product.name} in graph`} onClick={() => onGraph(product.id)}><Network size={14}/></button></span></div>)}</div>{!products.length && <p className="muted">No security positions supplied.</p>}{products.length > 6 && <button className="text-button cockpit-show-more" onClick={() => setAll(value => !value)}>{all ? 'Show top six' : `View all ${products.length} investments`} <ChevronDown size={12}/></button>}<p className="microcopy">Same-ISIN positions are combined. Cash is shown under Asset class.</p></div>;
}

function BreakdownSection({ dimension, rows, analysis, focus, onFocus }: { dimension: typeof dimensions[number]; rows: BreakdownRow[]; analysis: Analysis; focus?: string; onFocus: (id: string) => void }) {
  const [all, setAll] = useState(false);
  if (!analysis.weightsAvailable) return <p className="cockpit-empty">Select a non-overlapping portfolio to calculate exposure weights.</p>;
  const attributed = rows.reduce((sum, row) => sum + row.weight, 0), securityWeight = analysis.holdings.reduce((sum, holding) => sum + holding.weight, 0);
  return <div className="cockpit-table-body"><div className="cockpit-breakdown-table" aria-label={`Exposure by ${dimension.title.toLowerCase()}`}><div className="cockpit-table-head"><span>{dimension.title}</span><span className="numeric">Weight</span><span className="numeric">Vs target</span><span className="numeric">News</span></div>{(all ? rows : rows.slice(0, 6)).map(row => <button aria-expanded={focus === row.id} className={`cockpit-table-row ${focus === row.id ? 'focused' : ''}`} key={row.id} onClick={() => onFocus(row.id)}><span className="cockpit-cell-name">{row.name}{row.violation && <small className={row.violation.Severity === 'Error' ? 'negative' : ''}>Recorded {row.violation.Severity === 'Error' ? 'breach' : 'warning'}</small>}{row.isin && dimension.kind === 'company' && !row.via.includes(row.name) && <small>via {row.via[0]}</small>}</span><strong className="numeric">{percent(row.weight, 1)}</strong><span className={`numeric ${row.deviation == null ? 'unavailable' : row.deviation < 0 ? 'negative' : 'positive'}`}>{row.deviation == null ? '—' : `${row.deviation >= 0 ? '+' : '−'}${(Math.abs(row.deviation) * 100).toFixed(1)} pp`}</span><span className="numeric">{row.newsCount || '—'}</span></button>)}</div>{!rows.length && <p className="muted">No classified exposure available for this dimension.</p>}{rows.length > 6 && <button className="text-button cockpit-show-more" onClick={() => setAll(value => !value)}>{all ? 'Show top six' : `View all ${rows.length}`} <ChevronDown size={12}/></button>}<p className="cockpit-coverage-line"><strong>{percent(attributed, 1)} attributed</strong><span>{percent(Math.max(0, securityWeight - attributed), 1)} of portfolio in unattributed securities</span></p><details className="cockpit-method"><summary>Coverage and target comparison</summary><p>{dimension.note} Weights use the whole selected portfolio. A dash means no comparable policy target was supplied. Targets are compared only when classifications cover the same positions and weights.</p></details></div>;
}

function PromptRail({ prompts, onEvidence, onGraph, onFinding, onNewsGraph }: { prompts: AttentionItem[] } & Navigation) {
  const [all, setAll] = useState(false);
  function trace(item: AttentionItem) { if (item.contextId) onNewsGraph(item.contextId); else if (item.graphNodeId) onGraph(item.graphNodeId); else if (item.findingId && item.findingId !== 'customer-context') onFinding(item.findingId); }
  return <section className="panel cockpit-prompts" aria-label="Review actions"><div className="cockpit-section-heading"><h2>Review actions <span>{prompts.length}</span></h2>{prompts.length > 4 && <button className="text-button" onClick={() => setAll(value => !value)}>{all ? 'Show less' : 'View all'} <ArrowUpRight size={12}/></button>}</div>
    {!prompts.length && <p className="muted">No issue flagged by available checks. Coverage may be incomplete.</p>}
    {(all ? prompts : prompts.slice(0, 4)).map((prompt, index) => <details className={`cockpit-prompt ${prompt.level}`} key={prompt.id}><summary><span className="cockpit-prompt-index">{index + 1}</span><span className="cockpit-prompt-summary"><strong>{prompt.title}</strong><small>{prompt.label}</small></span><ChevronDown size={13}/></summary><div className="cockpit-prompt-detail">{prompt.metric && <strong className="cockpit-prompt-metric">{prompt.metric}</strong>}<p>{prompt.detail}</p><p><b>Next:</b> {prompt.action}</p><div className="cockpit-prompt-actions">{prompt.evidence[0] && <button onClick={() => onEvidence(prompt.evidence[0])}><FileText size={12}/>Evidence</button>}{(prompt.contextId || prompt.graphNodeId || (prompt.findingId && prompt.findingId !== 'customer-context')) && <button onClick={() => trace(prompt)}><Network size={12}/>Trace exposure</button>}</div>{prompt.evidence.length > 1 && <details className="cockpit-method"><summary>All {prompt.evidence.length} source records</summary>{prompt.evidence.map(source => <button className="text-button" key={source.id} onClick={() => onEvidence(source)}>{source.title} <ArrowUpRight size={11}/></button>)}</details>}</div></details>)}
    <p className="microcopy">For adviser review. Recorded findings may have changed since the supplied snapshot.</p>
  </section>;
}

function NewsPanel({ analysis, context, onEvidence, onNews, onNewsGraph }: { analysis: Analysis; context?: MarketContext; onEvidence: Navigation['onEvidence']; onNews: Navigation['onNews']; onNewsGraph: Navigation['onNewsGraph'] }) {
  const events = portfolioEvents(analysis, context).slice(0, 3);
  return <section className="panel cockpit-news" aria-label="Portfolio news"><div className="cockpit-section-heading"><h2>Portfolio news</h2><button className="text-button" onClick={() => onNews()}>All news <ArrowUpRight size={12}/></button></div><div className="cockpit-wire-status"><i/>{context ? `${context.checked}/${context.requested} searches checked` : 'News screening in progress'}</div>
    {events.map(event => <article className="cockpit-event" key={event.id}><div className="cockpit-event-meta"><span>{event.source}</span><time>{dateLabel(event.publishedAt, true)}</time></div><h3><a href={event.url} target="_blank" rel="noreferrer">{event.title}</a></h3><div className="cockpit-event-exposure"><button onClick={() => onNewsGraph(event.id)}>{event.names[0]}{event.names.length > 1 ? ` +${event.names.length - 1}` : ''} <ArrowUpRight size={11}/></button><span>{event.weight == null ? 'Weight unknown' : `${percent(event.weight, 1)} ${event.match === 'company' ? 'covered' : 'matched bucket'}`}</span><button aria-label={`Evidence for ${event.title}`} onClick={() => onEvidence(event.evidence)}><FileText size={12}/></button></div></article>)}
    {!events.length && <p className="muted">No headline has been matched to a holding in this window.</p>}
    <p className="microcopy">Linked exposure is not measured impact. Category weights may overlap; screening is not exhaustive.</p>
  </section>;
}

function Drilldown({ row, analysis, context, onEvidence, onNews, onGraph, onClose }: { row: BreakdownRow; analysis: Analysis; context?: MarketContext; onEvidence: Navigation['onEvidence']; onNews: Navigation['onNews']; onGraph: Navigation['onGraph']; onClose: () => void }) {
  const contributions = [...row.contributions].sort((a, b) => b.weight - a.weight), articles = (context?.items || []).filter(item => item.entityIds.includes(row.id));
  const value = analysis.aum != null ? analysis.aum * row.weight : null;
  return <section className="cockpit-drilldown" aria-label={`${row.name} exposure details`}><div className="cockpit-drilldown-head"><div><span className="eyebrow">{row.kind} exposure</span><h3>{row.name}</h3><p>{percent(row.weight, 1)} of portfolio{value != null ? ` · ${money(value, analysis.currency)} at snapshot` : ''}</p></div><button className="ws-icon" aria-label="Close this exposure" onClick={onClose}><X size={16}/></button></div>
    <div className="cockpit-drilldown-actions"><button className="text-button" onClick={() => onGraph(row.id)}>Trace connections <Network size={12}/></button><button className="text-button" onClick={() => onNews(row.id, row.name)}>Exposure news <ArrowUpRight size={12}/></button></div>
    {row.deviation != null && <p className="microcopy">{row.deviation >= 0 ? '+' : '−'}{(Math.abs(row.deviation) * 100).toFixed(1)} percentage points versus a {percent(row.target!, 1)} supplied target.</p>}
    <h4>Contributing positions</h4><div className="cockpit-contributions">{contributions.map(contribution => { const holding = analysis.holdings.find(h => h.id === contribution.id); return <button key={contribution.id} disabled={!holding} onClick={() => holding && onEvidence(holding.evidence)}><span>{contribution.name}<small>{holding ? `${holding.instrumentType} · ${percent(holding.weight, 2)} full position` : 'Position record unavailable'}</small></span><strong>{percent(contribution.weight, 2)}</strong></button>; })}</div>
    <p className="microcopy">Figures show the share of the whole portfolio contributed to this exposure. Fund contributions use position weight × published category weight.</p>
    <details className="cockpit-method"><summary>Calculation and all {row.evidence.length} sources</summary>{row.evidence.map(source => <button className="text-button" key={source.id} onClick={() => onEvidence(source)}>{source.title} <ArrowUpRight size={11}/></button>)}</details>
    {row.violation && <div className="cockpit-callout"><strong>Recorded {row.violation.Severity === 'Error' ? 'breach' : 'warning'} · {row.violation.RuleCode}</strong><p>Last flagged {dateLabel(row.violation.LastViolatedDateUTC, true)}. This supplied finding is not recomputed; verify its current status.</p></div>}
    {articles.length > 0 && <details className="cockpit-method"><summary>{articles.length} matched headline{articles.length === 1 ? '' : 's'}</summary>{articles.map(item => <article className="cockpit-article" key={item.id}><span>{item.source} · {dateLabel(item.publishedAt, true)}</span><a href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a><p>{item.relevance}</p></article>)}</details>}
    <details className="cockpit-method"><summary>Market comparisons unavailable</summary><p>A one-year comparison against an index or ETF needs compatible market-price history. The supplied reference prices alone do not provide that series.</p></details>
  </section>;
}
