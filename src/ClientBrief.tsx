import { RefreshCw, FileText } from 'lucide-react';
import type { Analysis, Evidence } from './lib/types';
import type { useBriefing } from './useBriefing';
import { contextEvidence, sections } from './lib/briefing';
import { clientContextEvidence, mandate, allocationReview, allocationEvidence } from './lib/advisory';
import { dateLabel, percent } from './lib/format';

export function ClientBrief({analysis,briefing,onEvidence,onNews}:{analysis:Analysis;briefing:ReturnType<typeof useBriefing>;onEvidence:(e:Evidence)=>void;onNews:()=>void}) {
  const m=mandate(analysis),policies=allocationReview(analysis);
  return <section className="ws-card ws-brief" aria-label="Client briefing">
    <div className="ws-section-heading"><div><span className="ws-kicker">MEETING PREPARATION</span><h2>Your client brief</h2></div><button className="ws-button ws-button--primary" disabled={!!briefing.phase} onClick={()=>briefing.refresh()}><RefreshCw size={13}/>{briefing.phase?'Updating…':'Refresh brief'}</button></div>
    <div className="ws-mandate"><button onClick={()=>onEvidence(clientContextEvidence(analysis))}>{m.label || 'Service not supplied'} ↗</button><span>{analysis.customer.IsClientACompany===true?'Company':analysis.customer.IsClientACompany===false?'Individual':'Client type unrecorded'} · {analysis.customer.RiskProfileName || 'Risk profile missing'} · Profile {dateLabel(analysis.customer.ProfilingDateUtc,true)}</span><p>{m.instruction}</p></div>
    <div className="ws-brief-grid">{sections.map(section=><article key={section.id}><h3>{section.title}</h3>{briefing.selection[section.id].map(id=>{
      const candidate=briefing.candidates.find(c=>c.id===id);if(!candidate)return null;
      const sources=candidate.sourceIds.map(id=>candidate.evidence?.find(e=>e.id===id)||analysis.evidence.find(e=>e.id===id)|| (briefing.context?.items.find(i=>i.id===id)?contextEvidence(briefing.context.items.find(i=>i.id===id)!):undefined)).filter((e):e is Evidence=>!!e);
      return <div key={id}><ul className="ws-brief-points">{candidate.text.split('\n').filter(Boolean).map((point,i)=><li key={i}>{point}</li>)}</ul>{sources.length>0 && <details className="ws-disclosure"><summary><FileText size={11}/> {new Set(sources.map(s=>s.id)).size} sources</summary>{[...new Map(sources.map(s=>[s.id,s])).values()].map(e=><button className="ws-link" key={e.id} onClick={()=>onEvidence(e)}>{e.title} ↗</button>)}</details>}</div>;
    })}{section.id==='outlook' && briefing.context?.items.some(i=>i.kind==='news') && !briefing.context?.items.some(i=>i.kind==='house-view') && <p className="ws-card-note">No matching house view supplied.</p>}{section.id==='outlook' && <button className="ws-link" onClick={onNews}>News & house views ↗</button>}</article>)}</div>
    <div className="ws-brief-status" role="status">{briefing.phase || briefing.message}{briefing.elapsedMs!=null && !briefing.phase?` · ${(briefing.elapsedMs/1000).toFixed(1)}s`:''}</div>
    <details className="ws-disclosure ws-policy"><summary>Mandate, objectives & allocation policy</summary><p>Current objectives, investment horizon and loss capacity are not verified by this export. Confirm them alongside dated customer instructions. {m.cashLabel}.</p>{policies.map(p=><div key={p.portfolioId}><h4>{p.name}</h4><p>{p.reason}</p>{p.rows.length>0 && <div className="ws-policy-scroll"><table><thead><tr><th>Asset class</th><th>Actual</th><th>Target</th><th>Deviation</th><th>Permitted band</th></tr></thead><tbody>{p.rows.map(r=><tr key={r.name}><td>{r.name}</td><td>{percent(r.actual)}</td><td>{percent(r.target)}</td><td>{r.actual>=r.target?'+':''}{((r.actual-r.target)*100).toFixed(1)} pp</td><td>{r.min==null?'—':percent(r.min)}–{r.max==null?'—':percent(r.max)}</td></tr>)}</tbody></table></div>}<button className="ws-link" onClick={()=>onEvidence(allocationEvidence(analysis,p))}>Policy source ↗</button></div>)}</details>
  </section>;
}
