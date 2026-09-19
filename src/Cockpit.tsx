import { ClientAvatar } from './ClientAvatar';
import { useMemo, useState } from 'react';
import { ArrowUpRight, FileText, Minus } from 'lucide-react';
import type { Analysis, Dataset, Evidence } from './lib/types';
import type { MarketContext } from './lib/briefing';
import { breakdownRows, cockpitPrompts, portfolioEvents, riskContributors, type BreakdownRow, type CockpitPrompt } from './lib/cockpit';
import { periodPerformance, ranges, type ExposureKind, type TimeRange } from './lib/portfolio';
import { clientName, dateLabel, list, money, number, percent } from './lib/format';

const dimensions: { kind: ExposureKind; title: string; note: string }[] = [
  { kind: 'country', title: 'By country', note: 'Reference country for direct securities plus country-specific fund categories. Broad regions are not guessed.' },
  { kind: 'industry', title: 'By industry', note: 'Direct classifications plus the supplied fund industry breakdowns, without counting a fund twice.' },
  { kind: 'company', title: 'By company', note: 'Direct equity plus published fund top-ten holdings, joined by ISIN. Share classes stay separate.' },
];

export function Cockpit({ analysis, dataset, context, range, onRange, onEvidence, onNews }: {
  analysis: Analysis; dataset: Dataset; context?: MarketContext; range: TimeRange;
  onRange: (r: TimeRange) => void; onEvidence: (e: Evidence) => void; onNews: (id: string, name: string) => void;
}) {
  const [focus, setFocus] = useState<{ kind: ExposureKind; id: string } | null>(null);
  const prompts = useMemo(() => cockpitPrompts(analysis, dataset, context), [analysis, dataset, context]);
  const rows = useMemo(() => Object.fromEntries(dimensions.map(d => [d.kind, breakdownRows(analysis, dataset, d.kind, context)])) as Record<ExposureKind, BreakdownRow[]>, [analysis, dataset, context]);
  const focused = focus ? rows[focus.kind]?.find(r => r.id === focus.id) : undefined;

  return <div className="cockpit">
    <div className="cockpit-top">
      <ClientRail analysis={analysis} dataset={dataset} onEvidence={onEvidence} />
      <div className="cockpit-centre">
        <PerformanceCard analysis={analysis} range={range} onRange={onRange} />
        <ImpactCard analysis={analysis} context={context} onEvidence={onEvidence} />
      </div>
      <PromptRail prompts={prompts} onEvidence={onEvidence} onFocus={id => { const kind = dimensions.map(d => d.kind).find(k => rows[k].some(r => r.id === id)); if (kind) setFocus({ kind, id }); }} />
    </div>

    {dimensions.map(dimension => <BreakdownSection key={dimension.kind} dimension={dimension} rows={rows[dimension.kind]} analysis={analysis} focus={focus} onFocus={id => setFocus(f => f?.id === id ? null : { kind: dimension.kind, id })} />)}

    {focused && <Drilldown row={focused} analysis={analysis} context={context} onEvidence={onEvidence} onNews={onNews} onClose={() => setFocus(null)} />}
  </div>;
}

function ClientRail({ analysis, dataset, onEvidence }: { analysis: Analysis; dataset: Dataset; onEvidence: (e: Evidence) => void }) {
  const [allNotes, setAllNotes] = useState(false);
  const customer = analysis.customer;
  const portfolio = analysis.portfolios.length === 1 ? analysis.portfolios[0] : undefined;
  const profile = dataset.reference.RiskProfiles.find(p => p.Id === customer.RiskProfileId);
  const volatility = number(portfolio?.Volatility);
  const ceiling = number(profile?.MaxVola);
  const proposal = analysis.proposals[0];
  const notes = allNotes ? analysis.notes : analysis.notes.slice(0, 3);
  const errors = analysis.violations.filter(v => v.Severity === 'Error').length;
  return <section className="panel cockpit-rail">
    <span className="eyebrow">CLIENT RECORD</span>
    <div className="client-identity-heading"><ClientAvatar client={customer}/><h2>{clientName(customer)}</h2></div>
    <p className="cockpit-rail-sub">{customer.RegulatoryClientTypeName || 'Customer'} · {customer.ReportingCurrency || 'Currency not recorded'}{customer.EsgProfileName ? ` · ESG ${customer.EsgProfileName}` : ''}</p>

    <dl className="cockpit-facts">
      <div><dt>Risk profile</dt><dd>{customer.RiskProfileName || 'Not recorded'}</dd></div>
      <div><dt>Service</dt><dd>{portfolio?.InvestmentServiceName || 'Multiple portfolios in scope'}</dd></div>
      <div><dt>Strategy</dt><dd>{analysis.strategy}</dd></div>
      <div><dt>Profiled</dt><dd>{dateLabel(customer.ProfilingDateUtc, true)}</dd></div>
      <div><dt>Liquidity</dt><dd>{money(analysis.liquidity, analysis.currency)}{analysis.aum && analysis.liquidity != null ? ` · ${percent(analysis.liquidity / analysis.aum)}` : ''}</dd></div>
    </dl>

    {volatility != null && <div className="cockpit-gauge">
      <div><span>Volatility vs profile ceiling</span><strong>{percent(volatility)}{ceiling != null ? ` / ${percent(ceiling)}` : ''}</strong></div>
      <div className="cockpit-gauge-track"><i style={{ width: `${Math.min(100, ceiling ? volatility / ceiling * 100 : 0)}%` }} /></div>
      <div className="cockpit-gauge-meta">
        <span>Expected return <b>{number(portfolio?.ExpectedReturn) != null ? percent(portfolio!.ExpectedReturn) : '—'}</b></span>
        <span>VaR <b>{number(portfolio?.ValueAtRisk) != null ? percent(portfolio!.ValueAtRisk) : '—'}</b></span>
      </div>
      <p className="microcopy">Supplied snapshot figures, not recalculated here.</p>
    </div>}

    <div className="cockpit-rail-block">
      <div className="cockpit-rail-head"><span className="eyebrow">ADVISER NOTES</span><span>{analysis.notes.length} recorded</span></div>
      {notes.map((note, i) => <div className="cockpit-note" key={i}><i /><div><p>{note.Note}</p><span>{dateLabel(note.CreatedByDateUTC, true)}</span></div></div>)}
      {!analysis.notes.length && <p className="muted">No customer notes were supplied.</p>}
      {analysis.notes.length > 3 && <button className="text-button" onClick={() => setAllNotes(a => !a)}>{allNotes ? 'Show the latest three' : `Show all ${analysis.notes.length} notes`}</button>}
    </div>

    {proposal && <div className="cockpit-rail-block">
      <span className="eyebrow">LAST PROPOSAL</span>
      <strong className="cockpit-proposal">{proposal.Reason || 'Investment proposal'}</strong>
      <span className="cockpit-rail-meta">{dateLabel(proposal.ProposedDateUTC, true)} · {proposal.ProposalStatusName || 'Status not recorded'}{list(proposal.SecurityPositions).length ? ` · ${list(proposal.SecurityPositions).length} proposed trades` : ''}</span>
    </div>}

    <div className="cockpit-counters">
      <div><strong>{analysis.proposals.length}</strong><span>Proposals</span></div>
      <div><strong>{analysis.holdings.length}</strong><span>Positions</span></div>
      <div className={errors ? 'flagged' : ''}><strong>{analysis.violations.length}</strong><span>Open findings</span></div>
    </div>
    {analysis.unresolved > 0 && <p className="microcopy">{analysis.unresolved} further advisory record{analysis.unresolved === 1 ? '' : 's'} reference a portfolio missing from this export and are excluded here.</p>}
    {analysis.evidence.some(e => e.id.startsWith('p-')) && <button className="text-button" onClick={() => onEvidence(analysis.evidence.find(e => e.id.startsWith('p-'))!)}><FileText size={13} />Inspect the portfolio record</button>}
  </section>;
}

function PerformanceCard({ analysis, range, onRange }: { analysis: Analysis; range: TimeRange; onRange: (r: TimeRange) => void }) {
  const period = periodPerformance(analysis, range);
  const latest = analysis.history.at(-1);
  const negative = (period.change ?? 0) < 0;
  return <section className="panel cockpit-performance">
    <div className="cockpit-performance-head">
      <div>
        <span className="eyebrow">PORTFOLIO VALUE{latest ? ` · ${dateLabel(latest.date, true)}` : ''}</span>
        <strong>{latest ? money(latest.value, analysis.historyCurrency) : money(analysis.aum,analysis.currency)}</strong>
      </div>
      {period.change != null
        ? <div className={`cockpit-delta ${negative ? 'negative' : 'positive'}`}><strong>{negative ? '▼' : '▲'} {percent(Math.abs(period.change))}</strong><span>{period.amount != null ? `${period.amount >= 0 ? '+' : '−'}${money(Math.abs(period.amount), analysis.historyCurrency)} over ${range}` : ''}</span></div>
        : <div className="cockpit-delta neutral"><strong>Not available</strong><span>{analysis.scopeAmbiguous ? 'Select one portfolio to resolve overlapping assets.' : `No matching ${range} start and end observations.`}</span></div>}
      <div className="range-control" role="group" aria-label="Portfolio history period">{ranges.map(r => <button key={r} aria-pressed={r === range} onClick={() => onRange(r)}>{r}</button>)}</div>
    </div>
    <ValueChart points={analysis.history} from={period.startDate} currency={analysis.historyCurrency} />
    <p className="microcopy">The whole supplied history; the selected {range} period is marked. {period.start && period.end ? `${dateLabel(period.start.date, true)} → ${dateLabel(period.end.date, true)}. ` : ''}Portfolio-value movement including possible cash flows, not a cash-flow-adjusted investment return. No holding-level attribution is claimed.</p>
  </section>;
}

function ValueChart({ points, from, currency }: { points: { date: string; value: number }[]; from: string; currency: string }) {
  if (points.length < 2) return <p className="muted">No compatible portfolio-value history is available in this scope.</p>;
  const values = points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const width = 640, height = 150;
  const coords = values.map((v, i) => [i / (values.length - 1) * width, height - 10 - (v - min) / span * (height - 26)] as const);
  const pair = ([x, y]: readonly [number, number]) => `${x},${y}`;
  // The selected period is drawn over the full history, so the range control never hides context.
  const start = Math.max(0, points.findIndex(p => p.date.slice(0, 10) >= from));
  const marked = coords.slice(Math.min(start, coords.length - 2));
  const falling = values.at(-1)! < values[Math.min(start, values.length - 2)];
  return <svg className="cockpit-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Portfolio value across ${points.length} observations, from ${money(values[0], currency)} to ${money(values.at(-1)!, currency)}`}>
    <polygon points={`${coords.map(pair).join(' ')} ${width},${height} 0,${height}`} className="cockpit-chart-fill" />
    <polyline points={coords.map(pair).join(' ')} className="cockpit-chart-line" />
    <polyline points={marked.map(pair).join(' ')} className={`cockpit-chart-last ${falling ? 'negative' : 'positive'}`} />
    <circle cx={coords.at(-1)![0]} cy={coords.at(-1)![1]} r="4" className={falling ? 'negative' : 'positive'} />
  </svg>;
}

function ImpactCard({ analysis, context, onEvidence }: { analysis: Analysis; context?: MarketContext; onEvidence: (e: Evidence) => void }) {
  const contributors = riskContributors(analysis).slice(0, 5);
  const events = portfolioEvents(analysis, context).slice(0, 3);
  const total = contributors.reduce((sum, h) => sum + h.riskContribution!, 0);
  return <section className="panel cockpit-impact">
    <div className="cockpit-impact-head"><span className="eyebrow">WHAT MOVED THE PORTFOLIO</span></div>

    <div className="cockpit-subhead"><h3>Largest risk contributors</h3><span className="cockpit-chip">Position-level profit and loss needs the market-price feed</span></div>
    {contributors.length ? <div className="cockpit-rows">
      {contributors.map(h => <button className="cockpit-row" key={h.id} onClick={() => onEvidence(h.evidence)}>
        <i style={{ height: `${Math.max(20, h.riskContribution! / (contributors[0].riskContribution || 1) * 26)}px` }} />
        <span className="cockpit-row-name">{h.displayName}</span>
        <span className="cockpit-row-weight">{percent(h.weight)}</span>
        <strong>{percent(h.riskContribution!, 2)}</strong>
      </button>)}
      <p className="microcopy">Supplied contribution to portfolio volatility — the share of risk each position carries, not a profit or loss. These five carry {percent(total, 2)} of {analysis.portfolios.length === 1 && number(analysis.portfolios[0].Volatility) != null ? percent(analysis.portfolios[0].Volatility) : 'the total'}.</p>
    </div> : <p className="muted">No risk-contribution figures were supplied for these positions.</p>}

    <div className="cockpit-subhead"><h3>Events touching these holdings</h3><span className="cockpit-chip">{context ? `${context.checked}/${context.requested} searches complete` : 'Screening in progress'}</span></div>
    {events.length ? <div className="cockpit-events">
      {events.map((event, i) => <button className="cockpit-event" key={event.id} onClick={() => onEvidence(event.evidence)}>
        <span className="cockpit-event-index">{i + 1}</span>
        <span className="cockpit-event-body"><strong>{event.title}</strong><small>{event.names.slice(0, 3).join(', ')} · {event.source} · {dateLabel(event.publishedAt, true)}</small></span>
        <span className="cockpit-event-weight"><strong>{event.weight == null ? '—' : percent(event.weight, 2)}</strong><small>{event.match === 'company' ? 'held directly' : 'in this category'}</small></span>
      </button>)}
    </div> : <p className="muted">No headline has been matched to a holding in this window yet.</p>}
    <p className="microcopy">Headlines are matched to holdings by name and ISIN. A match shows what to check; it does not prove the event moved the price.</p>
  </section>;
}

function PromptRail({ prompts, onEvidence, onFocus }: { prompts: CockpitPrompt[]; onEvidence: (e: Evidence) => void; onFocus: (id: string) => void }) {
  return <section className="panel cockpit-prompts">
    <span className="eyebrow">WHAT YOU COULD DO</span>
    <p className="cockpit-rail-sub">{prompts.length ? `${prompts.length} suggestion${prompts.length === 1 ? '' : 's'} from recorded findings, policy targets and customer notes.` : 'No recorded finding, target deviation or note needs an action in this scope. This is not a clean bill of health.'}</p>
    {prompts.map((prompt, i) => <article className={`cockpit-prompt ${prompt.level}`} key={prompt.id}>
      <div className="cockpit-prompt-top"><span className="cockpit-prompt-index">{i + 1}</span><span className="cockpit-prompt-label">{prompt.label}</span></div>
      <h3>{prompt.title}</h3>
      <p>{prompt.detail}</p>
      <p className="cockpit-prompt-action"><b>Next:</b> {prompt.action}</p>
      <div className="cockpit-prompt-actions">
        {prompt.evidence[0] && <button onClick={() => onEvidence(prompt.evidence[0])}><FileText size={12} />Inspect evidence{prompt.evidence.length > 1 ? ` (${prompt.evidence.length})` : ''}</button>}
        {prompt.exposureId && <button onClick={() => onFocus(prompt.exposureId!)}>Open the breakdown <ArrowUpRight size={12} /></button>}
      </div>
    </article>)}
    <p className="microcopy">Suggestions for adviser review. No order is placed from this screen.</p>
  </section>;
}

function BreakdownSection({ dimension, rows, analysis, focus, onFocus }: { dimension: { kind: ExposureKind; title: string; note: string }; rows: BreakdownRow[]; analysis: Analysis; focus: { kind: ExposureKind; id: string } | null; onFocus: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const attributed = rows.reduce((sum, r) => sum + r.weight, 0);
  if (!analysis.weightsAvailable) return <section className="panel cockpit-breakdown"><h3>{dimension.title}</h3><p className="muted">Choose a non-overlapping portfolio to calculate weights.</p></section>;
  const visible = all ? rows : rows.slice(0, 6);
  return <section className="panel cockpit-breakdown">
    <div className="cockpit-breakdown-head">
      <h3>{dimension.title}</h3>
      <p>{dimension.note} · {percent(attributed)} of the portfolio attributed</p>
    </div>
    <div className="cockpit-table" role="table" aria-label={dimension.title}>
      <div className="cockpit-table-head" role="row">
        <span role="columnheader">{dimension.kind === 'company' ? 'COMPANY' : dimension.kind === 'country' ? 'COUNTRY' : 'INDUSTRY'}</span>
        <span role="columnheader">SHARE</span>
        <span role="columnheader" className="numeric">VS TARGET</span>
        <span role="columnheader" className="numeric">HOLDINGS 1M</span>
        <span role="columnheader" className="numeric">INDEX 1M</span>
        <span role="columnheader" className="numeric">SECTOR ETF 1M</span>
        <span role="columnheader" className="numeric">NEWS</span>
      </div>
      {visible.map(row => <button role="row" className={`cockpit-table-row ${focus?.id === row.id ? 'focused' : ''}`} key={row.id} onClick={() => onFocus(row.id)}>
        <span role="cell" className="cockpit-cell-name">{row.name}{row.violation && <em className={row.violation.Severity === 'Error' ? 'breach' : 'warning'}>{row.violation.Severity === 'Error' ? 'Recorded breach' : 'Recorded warning'}</em>}{row.isin && dimension.kind === 'company' && !row.via.includes(row.name) && <em className="via">via {row.via[0]}</em>}</span>
        <span role="cell" className="cockpit-cell-bar"><i><b style={{ width: `${Math.min(100, row.weight / (rows[0]?.weight || 1) * 100)}%` }} /></i><strong>{percent(row.weight, 1)}</strong></span>
        <span role="cell" className={`numeric ${row.deviation == null ? 'unavailable' : row.deviation < 0 ? 'negative' : 'positive'}`}>{row.deviation == null ? 'no target' : `${row.deviation >= 0 ? '+' : '−'}${(Math.abs(row.deviation) * 100).toFixed(1)} pp`}</span>
        <span role="cell" className="numeric unavailable">—</span>
        <span role="cell" className="numeric unavailable">—</span>
        <span role="cell" className="numeric unavailable">—</span>
        <span role="cell" className="numeric">{row.newsCount || '—'}</span>
      </button>)}
    </div>
    {!rows.length && <p className="muted">No classified exposure is available for this dimension.</p>}
    {rows.length > 6 && <button className="text-button" onClick={() => setAll(a => !a)}>{all ? 'Show the top six' : `Show all ${rows.length}`}</button>}
    <p className="microcopy">Weights use the whole selected portfolio as denominator. Index and sector-ETF columns need a market-data feed; they stay empty rather than estimated.</p>
  </section>;
}

function Drilldown({ row, analysis, context, onEvidence, onNews, onClose }: { row: BreakdownRow; analysis: Analysis; context?: MarketContext; onEvidence: (e: Evidence) => void; onNews: (id: string, name: string) => void; onClose: () => void }) {
  // Each contribution is the share of THIS exposure a position carries, not the position's whole weight.
  const contributions = [...row.contributions].sort((a, b) => b.weight - a.weight);
  const articles = (context?.items || []).filter(i => i.entityIds.includes(row.id));
  const value = analysis.aum != null ? analysis.aum * row.weight : null;
  return <section className="panel cockpit-drilldown">
    <div className="cockpit-drilldown-head">
      <div>
        <span className="eyebrow">{row.kind === 'company' ? 'COMPANY EXPOSURE' : row.kind === 'country' ? 'COUNTRY EXPOSURE' : 'INDUSTRY EXPOSURE'}</span>
        <h3>{row.name}</h3>
        <p>{row.via.length} contributing position{row.via.length === 1 ? '' : 's'}{value != null ? ` · ${money(value, analysis.currency)} at the case snapshot` : ''}</p>
      </div>
      <div className="cockpit-drilldown-stats">
        <div className="dark"><strong>{percent(row.weight, 1)}</strong><span>of the portfolio</span></div>
        {row.deviation != null && <div><strong className={row.deviation < 0 ? 'negative' : 'positive'}>{row.deviation >= 0 ? '+' : '−'}{(Math.abs(row.deviation) * 100).toFixed(1)} pp</strong><span>vs {percent(row.target!, 1)} target</span></div>}
      </div>
      <button className="icon-button" aria-label="Close this exposure" onClick={onClose}><Minus size={18} /></button>
    </div>

    <div className="cockpit-drilldown-body">
      <div className="cockpit-drilldown-main">
        <div className="cockpit-compare">
          <div className="cockpit-compare-legend">
            <span><i className="holdings" />Your holdings</span>
            <span><i className="index" />Market index</span>
            <span><i className="etf" />Sector ETF</span>
          </div>
          <p className="muted">The one-year comparison against a market index and a sector ETF needs the market-data feed (FMP or OpenBB). The case export carries a single end-of-day price per instrument, so no series is drawn rather than estimated.</p>
        </div>
        <h4>What makes up this exposure</h4>
        <div className="cockpit-rows">
          {contributions.map(contribution => {
            const holding = analysis.holdings.find(h => h.id === contribution.id);
            return <button className="cockpit-row" key={contribution.id} onClick={() => holding && onEvidence(holding.evidence)}>
              <i />
              <span className="cockpit-row-name">{contribution.name}<small>{holding ? `${holding.instrumentType} · ${percent(holding.weight, 2)} position` : 'Position record unavailable'}</small></span>
              <span className="cockpit-row-weight">{holding ? money(holding.value, holding.currency) : ''}</span>
              <strong>{percent(contribution.weight, 2)}</strong>
            </button>;
          })}
          {!contributions.length && <p className="muted">The contributing positions could not be resolved for this row.</p>}
        </div>
        <p className="microcopy">The right-hand figure is the share of the whole portfolio this position contributes to {row.name} — for a fund, its position weight times the supplied category weight, never its full holding.</p>
        <button className="text-button" onClick={() => onEvidence(row.evidence[0])}><FileText size={13} />Inspect how this weight was calculated</button>
      </div>

      <aside className="cockpit-newsfeed">
        <div className="cockpit-rail-head"><span className="eyebrow">NEWS AFFECTING {row.name.toUpperCase()}</span></div>
        {row.violation && <div className="cockpit-callout">
          <span className={row.violation.Severity === 'Error' ? 'breach' : 'warning'}>RECORDED FINDING · {String(row.violation.Severity || 'Recorded').toUpperCase()}</span>
          <strong>{row.violation.RuleCode}</strong>
          <p>Last flagged {dateLabel(row.violation.LastViolatedDateUTC, true)}. An exported rule-engine finding, not recomputed here — check whether it is still open.</p>
        </div>}
        {articles.map(item => <article className="cockpit-article" key={item.id}>
          <span className="cockpit-article-meta">{item.source} · {dateLabel(item.publishedAt, true)}</span>
          <strong>{item.title}</strong>
          <p>{item.relevance}</p>
          <a href={item.url} target="_blank" rel="noreferrer">Read the article ↗</a>
        </article>)}
        {!articles.length && <p className="muted">No headline has been matched to this exposure in the current window.</p>}
        <button className="text-button" onClick={() => onNews(row.id, row.name)}>Open the full news screen <ArrowUpRight size={13} /></button>
        <p className="microcopy">Headlines are matched by name and ISIN; a match is a prompt to read the article, not proof of impact. Screening is not exhaustive.</p>
      </aside>
    </div>
  </section>;
}
