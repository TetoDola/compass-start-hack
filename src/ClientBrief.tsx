import { ArrowUpRight, ChevronDown, Quote, RefreshCw } from 'lucide-react';
import { eventQuestion } from './lib/eventContext';
import type { Analysis, Evidence } from './lib/types';
import type { useBriefing } from './useBriefing';
import { contextEvidence, sections, type BriefCandidate } from './lib/briefing';
import { mandate, allocationReview, allocationEvidence } from './lib/advisory';
import { dateLabel, percent } from './lib/format';
import './compact-brief.css';

const headings = { development: 'What changed', health: 'Portfolio state', outlook: 'Why it matters', actions: 'Next conversation' };

export function ClientBrief({ analysis, briefing, onEvidence, onNews }: { analysis: Analysis; briefing: ReturnType<typeof useBriefing>; onEvidence: (e: Evidence) => void; onNews: () => void }) {
  const m = mandate(analysis), policies = allocationReview(analysis);
  const clientNote = analysis.findings.find(f => f.id === 'customer-context')?.evidence[0];
  const noteText = clientNote?.fields.find(f => f.label === 'Note')?.value || '';
  const leadingAssets = analysis.weightsAvailable ? analysis.allocations.filter(a => a.weight > 0).slice(0, 2) : [];
  const composition = leadingAssets.map(a => `${percent(a.weight, 1)} ${a.label.toLowerCase()}`).join(' · ');
  const compositionEvidence: Evidence = { id: 'brief-composition', title: 'Portfolio asset composition', type: 'calculation', location: `clients.json / ${analysis.customer.ClientRef} / selected portfolios + reference.json / Securities`, fields: analysis.allocations.map(a => ({ label: a.label, value: percent(a.weight, 1) })), note: 'Supplied position/account weights grouped by reference asset class within the selected non-overlapping scope. Largest classes shown in the brief; this is not a suitability rating.' };
  const sourcesFor = (candidate: BriefCandidate) => [...new Map(candidate.sourceIds.flatMap(sourceId => {
    const item = briefing.context?.items.find(i => i.id === sourceId);
    const evidence = candidate.evidence?.find(e => e.id === sourceId) || analysis.evidence.find(e => e.id === sourceId) || (item ? contextEvidence(item) : undefined);
    return evidence ? [[evidence.id, evidence] as const] : [];
  })).values()];
  const researchIncluded = briefing.context?.items.some(i => i.kind === 'house-view');
  const sourceWarnings = [...new Set(briefing.context?.warnings || [])];
  const hasSourceLimits = sourceWarnings.length > 0 || /unavailable|failed|not configured|retained/i.test(briefing.message);
  const status = briefing.phase
    ? briefing.phase.startsWith('Refining the brief') ? 'Updating meeting brief…' : briefing.phase
    : hasSourceLimits ? 'Brief ready · review source status' : briefing.mode === 'ai-selected' ? 'Prepared for adviser review' : 'Prepared from source records';

  return <section className="compact-brief" aria-label="Meeting brief">
    <div className="cb-grid">
      <div className="cb-intro">
        <div className="cb-title-row"><h2>Meeting brief</h2><button type="button" className="cb-refresh" aria-label="Refresh meeting brief" title="Refresh meeting brief" disabled={!!briefing.phase} onClick={() => briefing.refresh()}><RefreshCw size={14} className={briefing.phase ? 'cb-spinning' : ''}/></button></div>
        {clientNote && noteText ? <>
          <div className="cb-client-note"><Quote size={17} aria-hidden="true"/><p>{noteText}</p></div>
          <button type="button" className="cb-link cb-note-source" onClick={() => onEvidence(clientNote)} aria-label="Read the full recorded client note and source">{dateLabel(clientNote.date, true)} · reconfirm<ArrowUpRight size={12}/></button>
        </> : <p className="cb-no-note">Start with the portfolio context, then confirm the client’s current priorities.</p>}
      </div>
      {sections.map((section, index) => {
        const selected = briefing.selection[section.id].flatMap(id => {
          const candidate = briefing.candidates.find(c => c.id === id);
          return candidate ? [candidate] : [];
        });
        const first = selected[0];
        const points = first?.text.split('\n').filter(Boolean) || [];
        const firstContext = briefing.context?.items.find(item => item.id === first?.contextId);
        const showComposition = section.id === 'health' && composition && !analysis.scopeAmbiguous;
        return <article key={section.id} className="cb-section">
          <h3><span className="cb-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{headings[section.id]}</h3>
          <div className="cb-section-content">
            <p className="cb-preview">{section.id === 'outlook' && firstContext?.kind === 'news' ? `News to review: ${points[0]}` : points[0] || 'No briefing detail is available for this scope.'}</p>
            <div className="cb-section-actions">
            <details className="cb-details">
              <summary aria-label={`Read full ${headings[section.id].toLowerCase()} and sources`}>Details & sources<ChevronDown size={12} aria-hidden="true"/></summary>
              <div className="cb-expanded">
                {selected.map(candidate => <div key={candidate.id} className="cb-candidate">
                  <ul>{candidate.text.split('\n').filter(Boolean).map((point, i) => <li key={i}>{point}</li>)}</ul>
                  {sourcesFor(candidate).map(evidence => <button type="button" className="cb-link cb-source" key={evidence.id} onClick={() => onEvidence(evidence)}>{evidence.title}<ArrowUpRight size={12}/></button>)}
                </div>)}
                {showComposition && <div className="cb-candidate"><p>{composition}. Recorded review points require current confirmation.</p><button type="button" className="cb-link cb-source" onClick={() => onEvidence(compositionEvidence)}>Portfolio asset composition<ArrowUpRight size={12}/></button></div>}
                {section.id === 'outlook' && firstContext?.kind === 'news' && <p className="cb-qualifier">{firstContext.exposureWeight != null ? `${percent(firstContext.exposureWeight, 2)} linked portfolio exposure. ` : 'Linked news; exposure not quantified. '}Impact unverified.</p>}
                {section.id === 'outlook' && <p className="cb-qualifier">{researchIncluded ? 'Matched research included.' : 'No matching house view supplied.'}</p>}
              </div>
            </details>
            {section.id === 'outlook' && <button type="button" className="cb-link cb-news" onClick={onNews}>Explore news<ArrowUpRight size={12}/></button>}
            </div>
          </div>
        </article>;
      })}
    </div>
    {briefing.talkingPoint && <div className="cb-pinned">
      <details className="cb-details">
        <summary><span className="cb-pinned-label">Added to this meeting</span><span className="cb-pinned-title">{briefing.talkingPoint.item.title}</span><ChevronDown size={13} aria-hidden="true"/></summary>
        <div className="cb-expanded"><p>{eventQuestion(analysis, briefing.talkingPoint.item)}</p><p className="cb-qualifier">{briefing.talkingPoint.item.exposureWeight != null ? `${percent(briefing.talkingPoint.item.exposureWeight, 2)} linked exposure. ` : 'No quantified exposure. '}Impact unverified.</p><button type="button" className="cb-link" onClick={() => onEvidence(contextEvidence(briefing.talkingPoint!.item))}>{briefing.talkingPoint.item.source} · {dateLabel(briefing.talkingPoint.item.publishedAt, true)}<ArrowUpRight size={12}/></button></div>
      </details>
      <button type="button" className="cb-link cb-remove" onClick={briefing.clearEvent} aria-label="Remove event from meeting brief">Remove</button>
    </div>}
    <div className="cb-footer">
      <div className="cb-status" role="status" aria-live="polite"><i className={briefing.phase ? 'is-working' : hasSourceLimits ? 'is-limited' : briefing.mode === 'structured' ? 'is-records' : ''} aria-hidden="true"/>{status}</div>
      <details className="cb-source-status cb-details"><summary>Source status{sourceWarnings.length > 0 ? ` (${sourceWarnings.length})` : ''}<ChevronDown size={12} aria-hidden="true"/></summary><div className="cb-expanded"><p>{briefing.message}</p>{sourceWarnings.length > 0 && <ul>{sourceWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}</div></details>
      <details className="cb-policy cb-details"><summary>Mandate & allocation policy<ChevronDown size={12} aria-hidden="true"/></summary>
        <div className="cb-policy-content"><p>{m.instruction} Current objectives, investment horizon and loss capacity are not verified by this export. {m.cashLabel}.</p>{policies.map(policy => <div key={policy.portfolioId}><h4>{policy.name}</h4><p>{policy.reason}</p>{policy.rows.length > 0 && <div className="cb-policy-scroll" role="region" aria-label={`${policy.name} allocation policy`} tabIndex={0}><table><thead><tr><th scope="col">Asset class</th><th scope="col">Actual</th><th scope="col">Target</th><th scope="col">Deviation</th><th scope="col">Permitted band</th></tr></thead><tbody>{policy.rows.map(row => <tr key={row.name}><th scope="row">{row.name}</th><td>{percent(row.actual)}</td><td>{percent(row.target)}</td><td>{row.actual >= row.target ? '+' : ''}{((row.actual - row.target) * 100).toFixed(1)} pp</td><td>{row.min == null ? '—' : percent(row.min)}–{row.max == null ? '—' : percent(row.max)}</td></tr>)}</tbody></table></div>}<button type="button" className="cb-link" onClick={() => onEvidence(allocationEvidence(analysis, policy))}>Policy source<ArrowUpRight size={12}/></button></div>)}</div>
      </details>
    </div>
  </section>;
}
