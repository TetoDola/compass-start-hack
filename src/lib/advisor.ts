import { pdfEvidence } from './reported';
import type { PdfAllocation } from './pdfImport';
import { selectedEventFact, type EventDiscussion } from './eventContext';
import { mandate, clientContextEvidence, aggregateProducts, productEvidence, allocationReview, allocationEvidence } from './advisory';
import type { Analysis, Evidence } from './types';
import { contextEvidence, newsTargets, type MarketContext } from './briefing';
import { portfolioAttention, portfolioExposures, periodPerformance, ranges, type TimeRange } from './portfolio';
import { materialEvent } from './events';
import { clientName, dateLabel, list, money, percent } from './format';

export interface AnswerBlock { id: string; title: string; text: string[]; evidence: Evidence[]; rows?: { name: string; value: string; newsId?: string }[]; articles?: { id: string; title: string; url: string; source: string }[] }
export interface AdvisorAnswer { blocks: AnswerBlock[]; mode: string }
export function advisorFacts(a: Analysis, context?: MarketContext, selection?: EventDiscussion): AnswerBlock[] {
  const note = a.findings.find(f => f.id === 'customer-context');
  const attention = portfolioAttention(a);
  const reported=a.findings.filter(f=>f.id.startsWith('reported-performance-'));
  const blocks: AnswerBlock[] = [
    {id:'mandate',title:'Mandate and decision prerequisites',text:[mandate(a).label,mandate(a).instruction,`Liquidity: ${mandate(a).cashLabel}. Last profile: ${dateLabel(a.customer.ProfilingDateUtc,true)}. Current objectives, horizon and loss capacity require confirmation.`],evidence:[clientContextEvidence(a)]},
    {id:'actions',title:'Conditional next steps',text:attention.slice(0,3).map(i=>`${i.title}: ${i.action}`),evidence:attention.slice(0,3).flatMap(i=>i.evidence)},
    {id:'policy',title:'Allocation versus supplied policy',text:allocationReview(a).map(r=>`${r.name}: ${r.reason} ${r.rows.map(x=>`${x.name} ${percent(x.actual)} actual / ${percent(x.target)} target`).join('; ')}`),evidence:allocationReview(a).map(r=>allocationEvidence(a,r))},
    { id: 'customer', title: 'Who is this customer?', text: [`${clientName(a.customer)} is ${a.customer.IsClientACompany === true ? 'a company' : a.customer.IsClientACompany === false ? 'a private client' : 'a customer'}. Strategy: ${a.strategy}. Risk profile: ${a.customer.RiskProfileName || 'not supplied'}.`, `Reported assets: ${money(a.aum,a.currency)}. Reported liquidity: ${money(a.liquidity,a.currency)}.`, ...(note ? [note.body] : ['No substantive customer notes supplied.'])], evidence: [...(note?.evidence || []), ...a.evidence.filter(e=>e.id.startsWith('p-'))] },
    { id: 'attention', title: 'What needs attention?', text: attention.length ? attention.slice(0,4).map(i => `${i.title}${i.metric ? ` — ${i.metric}` : ''}. ${i.detail} Next: ${i.action}`) : ['No issue flagged by the available checks. This does not establish suitability or the absence of risk.'], evidence: attention.slice(0,4).flatMap(i=>i.evidence) },
    { id: 'cash', title: 'Liquidity and customer needs', text: [`Reported liquidity is ${money(a.liquidity,a.currency)}${a.aum && a.liquidity != null ? ` (${percent(a.liquidity/a.aum)} of reported assets)` : ''}.`, ...(note ? [note.body] : ['No customer cash requirement supplied.']), `Reconfirm the amount and deadline. ${mandate(a).instruction} ${mandate(a).cashLabel}.`], evidence: [...a.evidence.filter(e=>e.id.startsWith('p-')), ...(note?.evidence || [])] },
    { id: 'positions', title: 'Largest positions by weight', text: [a.weightsAvailable ? 'Sorted by supplied portfolio weight. Cash is separate.' : 'Weights are unavailable for this scope; select one non-overlapping portfolio.'], rows: aggregateProducts(a).slice(0,10).map(p => ({name:`${p.name} (${p.positions.length} positions)`,value:a.weightsAvailable ? percent(p.weight,1) : 'Unavailable'})), evidence:aggregateProducts(a).slice(0,10).map(p=>productEvidence(a,p)) },
    { id: 'limits', title: 'What the records cannot establish', text: [reported.length?'Statements supply historical TWR and asset-class profit contributions. Daily returns, security-level attribution and complete fund constituents are unavailable. Current news does not establish historical causality.':'No cash-flow-adjusted return, daily price history, position-level performance attribution or complete company look-through was supplied. Current news cannot explain the shifted historical portfolio values.', 'I can show recorded issues, exposures and sourced headlines. I cannot establish that the portfolio is safe, forecast a return or execute a trade.'], evidence: [] },
  ];
  if(reported.length)blocks.push({id:'performance:reported',title:'Reported statement performance',text:reported.flatMap(f=>[f.title,...f.body.split('\n')]),evidence:reported.flatMap(f=>f.evidence)});
  for (const range of ranges) {
    const p = periodPerformance(a,range);
    const evidence: Evidence[] = p.start && p.end ? [{ id:`period:${range}`, title:`${range} portfolio-value change`, type:'calculation', location:'clients.json / selected Portfolios / PerformanceHistory',date:p.end.date,fields:[{label:'Start',value:`${p.start.date}: ${p.start.value}`},{label:'End',value:`${p.end.date}: ${p.end.value}`},{label:'Formula',value:'end / start − 1'}],note:'Observed portfolio values; not cash-flow-adjusted returns.' }] : [];
    blocks.push({ id:`performance:${range}`, title:`${range} portfolio development`, text:p.available ? [`Portfolio value ${p.change! >= 0 ? 'rose' : 'fell'} ${percent(Math.abs(p.change!))} (${money(Math.abs(p.amount!),a.historyCurrency)}) from ${dateLabel(p.start!.date,true)} to ${dateLabel(p.end!.date,true)}.`, `${money(p.start!.value,a.historyCurrency)} → ${money(p.end!.value,a.historyCurrency)}. This is value movement, including possible cash flows, not investment return. No position-level attribution is supplied.`] : [`${range} change is unavailable: there are no matching start/end observations. ${reported.length?'The statement supplies a dated reported return, not daily price history.':'The case history is monthly; no values are interpolated.'}`, ...(p.end ? [`Latest supplied observation: ${money(p.end.value,a.historyCurrency)} on ${dateLabel(p.end.date,true)}.`] : ['Select a portfolio with compatible value history.'])], evidence });
  }
  for (const kind of ['industry','country','company','region'] as const) {
    const rows = portfolioExposures(a,kind);
    blocks.push({ id:`exposure:${kind}`, title:`Exposure by ${kind}`, text:[a.weightsAvailable ? `${percent(rows.reduce((n,r)=>n+r.weight,0))} of the portfolio is attributed in this view. Weights use the whole portfolio, including the uncovered portion, as denominator.` : 'Select a non-overlapping portfolio to calculate exposure weights.', kind==='country' ? 'Direct reference countries, country-specific fund categories and classified published constituents. Country coverage can be partial. Broad regions and fund domicile are not substituted for underlying countries.' : kind==='company' ? 'Direct equity plus published fund constituents. Exact ISINs merge; different share classes remain separate. Indirect weights are estimates from dated snapshots.' : kind==='industry' ? 'Direct security classifications plus supplied fund industry breakdowns.' : 'Direct security reference regions and supplied fund regions; distinct from the individual country breakdown.'], rows: rows.slice(0,10).map(r=>({name:r.name,value:percent(r.weight,1),newsId:r.id})), evidence: rows.slice(0,10).flatMap(r=>r.evidence) });
  }
  for(const portfolio of a.portfolios.filter(p=>p.ExternalSource)) {
    for(const kind of ['industry','region'] as const){
      const allocations=list<PdfAllocation>(portfolio.ReportedAllocations).filter(r=>r.dimension===kind);
      const block=blocks.find(b=>b.id===`exposure:${kind}`);if(!block||!allocations.length)continue;
      block.text.push(`${portfolio.PortfolioNr}, statement ${dateLabel(portfolio.FactoryDateUtc,true)}: reported ${kind} breakdown as a percentage of EQUITIES, not the whole portfolio: ${allocations.map(r=>`${r.label} ${percent(r.weight,2)}`).join('; ')}. These aggregate percentages do not classify individual securities.`);
      block.evidence.push(pdfEvidence(portfolio,allocations[0].page,`reported-${kind}-${portfolio.PortfolioId}`,`Reported equity ${kind} breakdown`,allocations.map(r=>({label:r.label,value:percent(r.weight,2)})), 'Denominator: equities only. Retained separately from whole-portfolio classifications.'));
    }
  }
  const targets = newsTargets(a);
  const events = context?.items.filter(i=>i.kind==='news' && materialEvent(i.title) && i.entityIds.some(id=>targets.some(t=>t.id===id && (!t.kind || t.kind==='company')))) || [];
  blocks.push({ id:'events', title:'Material headlines to verify', text: events.length ? events.slice(0,4).map(i=>`${materialEvent(i.title)!.label}: ${i.title}. Linked to ${targets.filter(t=>i.entityIds.includes(t.id)).map(t=>`${t.name}${t.weight!=null ? ` (${percent(t.weight,2)} exposure)` : ''}`).join(', ')}. Verify the entity and event before acting; aggregate gains do not cancel this signal.`) : [`No material event was flagged in returned headlines. ${context ? `${context.checked}/${context.requested} exposure searches completed.` : 'News screening is still in progress.'} This is not exhaustive event monitoring.`], evidence:events.slice(0,4).map(contextEvidence), articles: events.slice(0,4).map(i=>({id:i.id,title:i.title,url:i.url,source:i.source})) });
  const news = context?.items.filter(i=>i.kind==='news').slice(0,5) || [];
  blocks.push({id:'news',title:'Connected news',text:[`${context?.checked || 0}/${context?.requested || targets.length} exposure searches complete. Current publication dates are separate from the case timeline. Headlines indicate relevance, not causality.`],evidence:news.map(contextEvidence), articles:news.map(i=>({id:i.id,title:i.title,url:i.url,source:i.source}))});
  for (const t of targets) {
    const articles = context?.items.filter(i=>i.entityIds.includes(t.id)).slice(0,4) || [];
    const exposure = portfolioExposures(a,t.kind || 'company').find(e=>e.id===t.id);
    blocks.push({id:`entity:${t.id}`,title:t.name,text:[`${t.weight==null ? 'Combined exposure unavailable' : `${percent(t.weight,2)} of selected portfolio`}. ${t.via}.`, articles.length ? 'These headlines are linked by entity relevance. Verify their context before drawing a conclusion.' : 'No matching headlines returned so far. That does not mean there is no event or risk.'],evidence:[...(exposure?.evidence || []),...articles.map(contextEvidence)],articles:articles.map(i=>({id:i.id,title:i.title,url:i.url,source:i.source}))});
  }
  const selected=selectedEventFact(a,selection);
  if(selected)blocks.unshift(selected);
  return blocks;
}
export function routeQuestion(question: string, facts: AnswerBlock[], previousQuestions: string[] = []): string[] {
  if(facts.some(f=>f.id==='selected-event'))return ['selected-event'];
  const q = question.toLowerCase(); const ids: string[] = [];
  const add = (id: string) => { if (facts.some(f=>f.id===id) && !ids.includes(id)) ids.push(id); };
  if (/brief|overview|summari[sz]e|summary/.test(q)) return [...(facts.find(f=>f.id==='events')?.articles?.length ? ['events'] : []),'attention',facts.some(f=>f.id==='performance:reported')?'performance:reported':'performance:1M','customer'];
  if (/wrong|attention|problem|breach|risk|issue|safe|concentrat/.test(q)) {add('attention');add('events');}
  if (/next|action|proposal|recommend|rebalance|should|options/.test(q)) {add('actions');add('mandate');}
  if (/policy|target|allocation|drift/.test(q))add('policy');
  if (/mandate|pension|execution.only/.test(q))add('mandate');
  if (/who|customer|client|profile|preference/.test(q)) add('customer');
  if (/cash|liquid|withdraw|tax|funding/.test(q)) add('cash');
  const range: TimeRange = /\b1d\b|one day|1 day|daily|today/.test(q) ? '1D' : /\b7d\b|7 days|week/.test(q) ? '7D' : /\b1y\b|1 year|one year|year|12 months/.test(q) ? '1Y' : '1M';
  if (/perform|return|gain|loss|lost|value|happen|doing|change|\b1[dm y]\b|7d|month|week|year/.test(q) || (/what about|and for|instead/.test(q) && previousQuestions.some(p=>/perform|value|return/i.test(p)))) add(`performance:${range}`);
  if (/perform|return|happen|profit|annual|year|why|contribut/.test(q) && facts.some(f=>f.id==='performance:reported'))add('performance:reported');
  if (/why|caus|benchmark|attribut|forecast|predict|buy|sell|recommend/.test(q)) add('limits');
  if (/countr|geograph/.test(q)) add('exposure:country');
  if (/industr|sector/.test(q)) add('exposure:industry');
  if (/compan|issuer|underlying/.test(q)) add('exposure:company');
  if (/region/.test(q)) add('exposure:region');
  if (/position|holdings|largest|weight/.test(q) && !ids.some(i=>i.startsWith('exposure'))) add('positions');
  if (/expos|invested|where.*money/.test(q) && !ids.some(i=>i.startsWith('exposure'))) {add('exposure:industry');add('exposure:country');add('exposure:company');}
  const matched = facts.filter(f=>f.id.startsWith('entity:') && f.title.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>=4 && !['holdings','registered','shares','ordinary','class','group'].includes(w)).some(w=>new RegExp(`\\b${w}\\b`).test(q)));
  matched.slice(0,3).forEach(f=>add(f.id));
  if (/bankrupt|insolven|default|distress|material event/.test(q)) add('events');
  if (/news|headline|article/.test(q) && !matched.length) add('news');
  return ids.slice(0,5);
}
export function answerFromIds(ids: string[], facts: AnswerBlock[], mode = 'Source-backed answer'): AdvisorAnswer {
  const blocks = ids.map(id=>facts.find(f=>f.id===id)).filter((f):f is AnswerBlock=>!!f);
  return { mode, blocks:blocks.length ? blocks : [{id:'unavailable',title:'I cannot answer that from the available records',text:['Try asking about this customer, portfolio issues, value changes, positions, country or industry exposures, company holdings, liquidity or linked news. No facts were inferred for this question.'],evidence:[]}] };
}
