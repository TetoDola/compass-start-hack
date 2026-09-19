import { contextEvidence, newsTargets, type ContextItem } from './briefing';
import { clientContextEvidence, mandate } from './advisory';
import { portfolioExposures } from './portfolio';
import { dateLabel, money, percent } from './format';
import type { Analysis } from './types';
import type { AnswerBlock } from './advisor';

export interface EventDiscussion {
  item: ContextItem;
  customerId: number;
  scope: string;
  scenario?: { companyId: string; move: number };
}
export function eventQuestion(a: Analysis, item: ContextItem): string {
  const companies=newsTargets(a).filter(t=>item.entityIds.includes(t.id)&&(!t.kind||t.kind==='company'));
  if (companies.length) return `What does the original report establish about ${companies.map(t=>t.name).slice(0,2).join(' and ')}, and does the covered position still fit the client's confirmed objectives?`;
  if (item.entityIds.length) return 'Which owned companies have a documented operating exposure to this event? Confirm that link before considering any portfolio change.';
  return 'Does any holding have a documented connection to this event? No portfolio impact is established by the available records.';
}
export function selectedEventFact(a: Analysis, selection?: EventDiscussion): AnswerBlock | undefined {
  if (!selection || selection.customerId!==a.customer.ClientId || selection.scope!==a.scope) return;
  const {item,scenario}=selection;
  const targets=newsTargets(a),linked=targets.filter(t=>item.entityIds.includes(t.id));
  const note=a.findings.find(f=>f.id==='customer-context');
  const related=linked.flatMap(t=>portfolioExposures(a,t.kind||'company').find(e=>e.id===t.id)?.evidence||[]);
  const subject=scenario&&targets.find(t=>t.id===scenario.companyId&&(!t.kind||t.kind==='company'));
  const effect=subject?.weight!=null&&scenario&&Number.isFinite(scenario.move)&&scenario.move>=-1?subject.weight*scenario.move:null;
  return {
    id:'selected-event', title:'Selected event · this portfolio',
    text:[
      `${item.title} — ${item.source}, ${dateLabel(item.publishedAt,true)}.`,
      ...(item.summary?[item.summary]:[]),
      linked.length ? `Linked exposure: ${linked.map(t=>`${t.name}: ${t.weight==null?'unknown weight':percent(t.weight,2)} (${t.via})`).join('; ')}. ${item.matchKind==='company'?'Company mentioned in source; financial impact remains unverified.':'Country/sector context only; operating or supply-chain exposure is not established.'}` : 'Global context: no supported holding or category match in this portfolio.',
      `Client scope: ${a.customer.ClientRef} · ${a.scope==='all'?'all supplied portfolios':a.portfolios[0]?.PortfolioNr} · ${mandate(a).label}.`,
      ...(note?[`Recorded client context: ${note.body}`]:[]),
      ...(effect!=null&&scenario&&subject?[`Independent sensitivity: ${subject.name}, ${percent(subject.weight!,2)} covered weight × ${percent(scenario.move,1)} assumed price move = ${(effect*100).toFixed(2)} pp${a.aum!=null?` (${money(a.aum*effect,a.currency)})`:''}. Other prices and FX held fixed; this is not the event's predicted effect.`]:[]),
      `Prepare: ${eventQuestion(a,item)}`,
      mandate(a).instruction,
    ],
    evidence:[contextEvidence(item),clientContextEvidence(a),...related,...(note?.evidence||[])],
    articles:[{id:item.id,title:item.title,url:item.url,source:item.source}],
  };
}
