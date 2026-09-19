import { eventQuestion } from './lib/eventContext';
import { RefreshCw, FileText, Sparkles, Quote, ArrowUpRight } from 'lucide-react';
import type { Analysis, Evidence } from './lib/types';
import type { useBriefing } from './useBriefing';
import { contextEvidence, sections } from './lib/briefing';
import { mandate, allocationReview, allocationEvidence } from './lib/advisory';
import { dateLabel, percent } from './lib/format';

export function ClientBrief({ analysis, briefing, onEvidence, onNews }: { analysis: Analysis; briefing: ReturnType<typeof useBriefing>; onEvidence: (e: Evidence) => void; onNews: () => void }) {
  const m = mandate(analysis), policies = allocationReview(analysis);
  const clientNote = analysis.findings.find(f => f.id === 'customer-context')?.evidence[0];
  const noteText = clientNote?.fields.find(f => f.label === 'Note')?.value || '';
  const notePreview = noteText.length > 190 ? noteText.slice(0,190).replace(/\s+\S*$/, '') + '…' : noteText;
  const leadingAssets = analysis.weightsAvailable ? analysis.allocations.filter(a => a.weight > 0).slice(0, 2) : [];
  const composition = leadingAssets.length ? leadingAssets.map(a => `${percent(a.weight, 1)} ${a.label.toLowerCase()}`).join(' · ') + '.' : '';
  const compositionEvidence: Evidence = { id: 'brief-composition', title: 'Portfolio asset composition', type: 'calculation', location: `clients.json / ${analysis.customer.ClientRef} / selected portfolios + reference.json / Securities`, fields: analysis.allocations.map(a => ({ label: a.label, value: percent(a.weight, 1) })), note: 'Supplied position/account weights grouped by reference asset class within the selected non-overlapping scope. Largest classes shown in the brief; this is not a suitability rating.' };
  const headings = { development: 'What changed', health: 'Portfolio state', outlook: 'Why it matters', actions: 'Next conversation' };
  return <section className="ws-card ws-brief" aria-label="Client briefing">
    <div className="ws-section-heading"><h2><Sparkles size={15}/>Meeting brief</h2><button className="ws-icon" aria-label="Refresh brief" title="Refresh brief" disabled={!!briefing.phase} onClick={() => briefing.refresh()}><RefreshCw size={15} className={briefing.phase ? 'spin' : ''}/></button></div>
    {clientNote && noteText && <div className="ws-brief-client"><Quote size={14}/><div><p>{notePreview}</p><button className="ws-note-source" onClick={() => onEvidence(clientNote)}>{dateLabel(clientNote.date,true)} · recorded client context · reconfirm<ArrowUpRight size={11}/></button></div></div>}
    <div className="ws-brief-grid">{sections.map((section, index) => <article key={section.id} className={`ws-brief-section ws-brief-${section.id}`}>
      <h3><span>{String(index + 1).padStart(2, '0')}</span>{headings[section.id]}</h3>
      {briefing.selection[section.id].map(id => {
        const candidate = briefing.candidates.find(c => c.id === id); if (!candidate) return null;
        const points = candidate.text.split('\n').filter(Boolean);
        const contextItem = briefing.context?.items.find(item => item.id === candidate.contextId);
        const sources = [...new Map(candidate.sourceIds.map(sourceId => candidate.evidence?.find(e => e.id === sourceId) || analysis.evidence.find(e => e.id === sourceId) || (briefing.context?.items.find(i => i.id === sourceId) ? contextEvidence(briefing.context.items.find(i => i.id === sourceId)!) : undefined)).filter((e): e is Evidence => !!e).map(e => [e.id, e])).values()];
        const stateSummary = section.id === 'health' && composition && !analysis.scopeAmbiguous;
        if (stateSummary) sources.unshift(compositionEvidence);
        // Keep the leading thought whole. Qualifications and source records remain one click away.
        return <div key={id}>
          <ul className="ws-brief-points">{(section.id === 'health' ? points.slice(0,2) : points.slice(0,1)).map((point,i)=><li key={i}>{point}</li>)}</ul>
          {stateSummary && <p className="ws-brief-qualifier">{composition} Recorded review points require current confirmation.</p>}
          {section.id === 'development' && id === 'fact:value-development' && <p className="ws-brief-qualifier">Value change includes possible cash flows.</p>}
          {section.id === 'outlook' && contextItem?.kind==='news' && <p className="ws-brief-qualifier">{contextItem?.exposureWeight != null ? `${percent(contextItem.exposureWeight, 2)} linked portfolio exposure. Impact unverified.` : 'Linked news · exposure not quantified. Impact unverified.'}</p>}
          {(sources.length > 0 || points.length > 1) && <details className="ws-disclosure ws-brief-evidence"><summary><FileText size={11}/>{points.length > 1 ? 'Details & sources' : `${sources.length} source${sources.length === 1 ? '' : 's'}`}</summary>
            {(points.length > 1 || stateSummary) && <ul className="ws-brief-points">{points.slice(section.id==='health'?2:1).map((point, i) => <li key={i}>{point}</li>)}</ul>}
            {sources.map(e => <button className="ws-link" key={e.id} onClick={() => onEvidence(e)}>{e.title} ↗</button>)}
          </details>}
        </div>;
      })}
      {section.id === 'outlook' && <><p className="ws-card-note">{briefing.context?.items.some(i => i.kind === 'house-view') ? 'Matched research included.' : 'No matching house view supplied.'}</p><button className="ws-link" onClick={onNews}>Explore news ↗</button></>}
    </article>)}</div>
    {briefing.talkingPoint && <div className="ws-pinned-event"><div><strong>Added to this meeting</strong><button className="ws-link" onClick={briefing.clearEvent}>Remove ×</button></div><ul className="ws-brief-points"><li>{briefing.talkingPoint.item.title}</li><li>{eventQuestion(analysis,briefing.talkingPoint.item)}</li></ul><p className="ws-brief-qualifier">{briefing.talkingPoint.item.exposureWeight!=null?`${percent(briefing.talkingPoint.item.exposureWeight,2)} linked exposure. `:'No quantified exposure. '}Impact unverified.</p><button className="ws-link" onClick={()=>onEvidence(contextEvidence(briefing.talkingPoint!.item))}>{briefing.talkingPoint.item.source} · {dateLabel(briefing.talkingPoint.item.publishedAt,true)} ↗</button></div>}
    <div className="ws-brief-status" role="status"><i className={briefing.phase ? 'is-working' : ''}/>{briefing.phase || briefing.message}{briefing.elapsedMs != null && !briefing.phase ? ` · ${(briefing.elapsedMs / 1000).toFixed(1)}s` : ''}</div>
    <details className="ws-disclosure ws-policy"><summary>Mandate & allocation policy</summary><p>{m.instruction} Current objectives, investment horizon and loss capacity are not verified by this export. {m.cashLabel}.</p>{policies.map(p => <div key={p.portfolioId}><h4>{p.name}</h4><p>{p.reason}</p>{p.rows.length > 0 && <div className="ws-policy-scroll"><table><thead><tr><th>Asset class</th><th>Actual</th><th>Target</th><th>Deviation</th><th>Permitted band</th></tr></thead><tbody>{p.rows.map(r => <tr key={r.name}><td>{r.name}</td><td>{percent(r.actual)}</td><td>{percent(r.target)}</td><td>{r.actual >= r.target ? '+' : ''}{((r.actual - r.target) * 100).toFixed(1)} pp</td><td>{r.min == null ? '—' : percent(r.min)}–{r.max == null ? '—' : percent(r.max)}</td></tr>)}</tbody></table></div>}<button className="ws-link" onClick={() => onEvidence(allocationEvidence(analysis, p))}>Policy source ↗</button></div>)}</details>
  </section>;
}
