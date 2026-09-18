import { aggregateProducts, clientContextEvidence, lookThrough, mandate } from './advisory';
import type { Analysis, Evidence } from './types.ts';
import { portfolioAttention, periodPerformance, portfolioExposures } from './portfolio';
import { materialEvent, type MaterialEvent } from './events';
import { dateLabel, money, percent } from './format.ts';

export type SectionKey = 'development' | 'health' | 'outlook' | 'actions';
export const sections: { id: SectionKey; title: string; subtitle: string }[] = [
  { id: 'development', title: 'What happened', subtitle: 'The context to carry forward' },
  { id: 'health', title: 'Where things stand', subtitle: 'The portfolio points worth reviewing' },
  { id: 'outlook', title: 'What to watch', subtitle: 'News and a dated research perspective' },
  { id: 'actions', title: 'What to do next', subtitle: 'Prepare the next conversation' },
];
export interface NewsTarget { kind?: 'company' | 'industry' | 'country' | 'region'; id: string; name: string; isin?: string; symbol?: string; via: string; weight: number | null }
export interface ContextItem { id: string; kind: 'news' | 'house-view'; title: string; source: string; url: string; publishedAt: string; retrievedAt: string; entityIds: string[]; relevance: string; imageUrl?: string; summary?: string; sample?: boolean; provider: string; provenance?: 'public-research' | 'bank-approved'; exposureWeight?: number | null; matchKind?: 'company' | 'topic'; event?: MaterialEvent }
export interface MarketContext { items: ContextItem[]; checked: number; requested: number; totalEligible?: number; warnings: string[]; elapsedMs: number; fetchedAt: string; providers: string[]; checkedIds?: string[]; windowDays?: number }
export interface BriefCandidate { id: string; section: SectionKey; text: string; sourceIds: string[]; findingId?: string; contextId?: string; evidence?: Evidence[] }
export interface BriefSelection { development: string[]; health: string[]; outlook: string[]; actions: string[] }
export interface BriefResult { selection: BriefSelection; mode: 'structured' | 'ai-selected'; message: string; elapsedMs: number }

export const instrumentId = (isin: string | undefined, fallback: string) => isin ? `instrument:${isin}` : fallback;
export function newsTargets(a: Analysis): NewsTarget[] {
  const result = new Map<string, NewsTarget>();
  const put = (target: NewsTarget) => { const old = result.get(target.id); if (!old) result.set(target.id, target); else { old.weight = old.weight == null || target.weight == null ? null : old.weight + target.weight; old.via = [...new Set([old.via, target.via])].join(' · '); } };
  for (const h of a.holdings) {
    if (['Shares', 'Dividend right certificates', 'Participation certificate'].includes(h.instrumentType)) put({ id: instrumentId(h.isin, h.id), name: h.displayName, isin: h.isin, via: 'Direct position', weight: a.weightsAvailable ? h.weight : null });
    for (const [i, c] of (['partial','complete'].includes(lookThrough(h).status) ? h.fundHoldings?.holdings || [] : []).entries()) put({ id: instrumentId(c.isin, `underlying:${h.isin || h.id}:${i}`), name: c.name, isin: c.isin, via: h.displayName, weight: a.weightsAvailable ? h.weight * c.weight : null });
  }
  const companies = [...result.values()].sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const categories = (['industry', 'country', 'region'] as const).flatMap(kind => portfolioExposures(a, kind).map(e => ({ id: e.id, name: e.name, kind, via: `${kind} exposure`, weight: e.weight })));
  return [...companies, ...categories];
}
export function contextEvidence(item: ContextItem): Evidence {
  return { id: item.id, type: 'record', title: item.title, location: item.url, date: item.publishedAt, fields: [{ label: 'Publisher / source', value: item.source }, { label: 'Published', value: dateLabel(item.publishedAt, true) }, { label: 'Relevance', value: item.relevance }, { label: 'Feed', value: item.provider }, ...(item.summary ? [{ label: 'Context', value: item.summary }] : [])], note: item.kind === 'house-view' ? item.provenance === 'bank-approved' ? 'Uploader declares this bank-approved research; Compass has not independently verified approval. Check scope and date before applying it.' : 'Public or uploaded research, not independently verified as a bank-approved view. Check the date and original source.' : 'Headline-level coverage. Entity relevance is inferred, not proof of portfolio impact or causality. Open the article to verify its context.' };
}
const short = (s: string, max = 25) => { const words = s.split(/\s+/); return words.length > max ? words.slice(0, max).join(' ') + '…' : s; };
export function briefingCandidates(a: Analysis, context?: MarketContext | null): BriefCandidate[] {
  const candidates: BriefCandidate[] = [];
  const add = (c: BriefCandidate) => candidates.push(c);
  const agenda=portfolioAttention(a);
  const top=agenda.slice(0,2);
  const mandateEvidence=clientContextEvidence(a);
  if(top.length)add({id:'agenda:health',section:'health',text:top.map(i=>`${i.title}${i.metric?` — ${i.metric}`:''}.`).join('\n'),sourceIds:top.flatMap(i=>i.evidence.map(e=>e.id)),evidence:top.flatMap(i=>i.evidence)});
  const need=agenda.find(i=>i.id==='cash-need');
  const action=a.scopeAmbiguous?agenda[0]:need || agenda.find(i=>i.level!=='gap') || agenda[0];
  const mandateInstruction=mandate(a).instruction;
  add({id:'agenda:actions',section:'actions',text:[need && !a.scopeAmbiguous?`${money(a.liquidity,a.currency)} reported liquidity. Reconfirm whether the dated cash need remains open.`:'',(action?.action || 'Confirm current objectives, time horizon and loss tolerance.').replace(mandateInstruction,'').trim(),mandateInstruction].filter(Boolean).join('\n'),sourceIds:[...(action?.evidence.map(e=>e.id)||[]),mandateEvidence.id],evidence:[...(action?.evidence||[]),mandateEvidence]});
  for (const f of a.findings) {
    let text = short(f.body, 31);
    let extraEvidence:Evidence[]=[];
    if (f.id === 'customer-context') { const e = f.evidence[0]; text = `${short(e.fields.find(f => f.label === 'Note')?.value || f.body, 22)} Recorded ${dateLabel(e.date, true)}; reconfirm.`; }
    if (f.id === 'recorded-issues') text = `${a.violations.length} recorded review points; current resolution unverified.\n${money(a.liquidity, a.currency)} reported liquidity.\nSupplied findings; no new breaches calculated.`;
    if (f.id === 'largest-holding') {const p=aggregateProducts(a)[0];text=`${p.name} accounts for ${percent(p.weight)} across ${p.positions.length} selected positions; compare with the agreed product limits.`;}
    if (f.id === 'value-development') {const p=periodPerformance(a,'1M');if(p.available)text=`${p.change!>=0?'+':'−'}${percent(Math.abs(p.change!))} portfolio value (${money(Math.abs(p.amount!),a.historyCurrency)} ${p.change!>=0?'increase':'decrease'}) · ${dateLabel(p.start!.date,true)}–${dateLabel(p.end!.date,true)}.\nValue movement, not investment return; cash flows may contribute.`;const note=a.findings.find(f=>f.id==='customer-context');if(note){text+=`\nClient note · ${dateLabel(note.evidence[0]?.date,true)}: ${short(note.evidence[0]?.fields.find(x=>x.label==='Note')?.value || note.body,24)} Reconfirm.`;extraEvidence=note.evidence;}}
    add({ id: `fact:${f.id}`, section: f.section === 'happened' ? 'development' : 'health', text, sourceIds: [...(f.id === 'recorded-issues' ? a.portfolios.map(p => `p-${p.PortfolioId}`) : []), ...f.evidence.map(e => e.id),...extraEvidence.map(e=>e.id)], evidence:[...f.evidence,...extraEvidence], findingId: f.id });
    add({ id: `action:${f.id}`, section: 'actions', text: short(f.question, 31), sourceIds: f.evidence.map(e => e.id), findingId: f.id });
  }
  if (a.scopeAmbiguous) add({ id: 'scope', section: 'health', text: 'Overlapping portfolios: combined totals may double-count assets.\nSelect one portfolio to see totals, liquidity and exposure weights.', sourceIds: a.portfolios.map(p => `p-${p.PortfolioId}`) });
  if (!candidates.some(c => c.section === 'development')) add({ id: 'no-history', section: 'development', text: 'No dated advisory history was supplied. Start by confirming the customer’s current objectives.', sourceIds: [] });
  for (const item of [...(context?.items.filter(i => i.kind === 'news') || [])].sort((a,b) => Number(!!materialEvent(b.title))-Number(!!materialEvent(a.title)) || Number(b.matchKind==='company')-Number(a.matchKind==='company') || (b.exposureWeight||0)-(a.exposureWeight||0)).slice(0, 11).concat(context?.items.filter(i => i.kind === 'house-view') || [])) add({ id: item.id, section: 'outlook', text: item.kind === 'news' ? `${short(item.title, 20)} · ${dateLabel(item.publishedAt, true)}.\n${short(item.relevance.split('. Matches')[0],28)}. Impact unverified.` : `${item.provenance==='bank-approved'?'Bank view (uploader-declared)':'Public research'} · ${dateLabel(item.publishedAt,true)}: ${item.title}.\n${short(item.summary || item.relevance,28)}`, sourceIds: [item.id], contextId: item.id });
  if (!context?.items.length) add({ id: 'no-outlook', section: 'outlook', text: `${context ? 'No recent matching news verified.' : 'Refresh to check current news.'}\nNo bank-approved house view supplied.`, sourceIds: [] });
  return candidates;
}
export function defaultSelection(candidates: BriefCandidate[]): BriefSelection {
  const first = (section: SectionKey, preferred?: string) => candidates.find(c => c.section === section && c.id === preferred)?.id || candidates.find(c => c.section === section)?.id;
  const health = first('health', candidates.some(c=>c.id==='scope')?'scope':'agenda:health');
  const outlook = candidates.filter(c => c.section === 'outlook');
  const chosenOutlook=[...outlook.filter(c=>c.id.startsWith('news:')).slice(0,1),...outlook.filter(c=>c.id.startsWith('house:')).slice(0,1),...outlook.filter(c=>c.id==='no-outlook')].map(c=>c.id);
  return { development: [first('development', 'fact:value-development')!], health: [health!], outlook: chosenOutlook.length?chosenOutlook:[first('outlook')!], actions: [first('actions', 'agenda:actions')!] };
}
// AI selects source-backed sentences; it cannot invent amounts, trades, deadlines or causal claims.
export function validateSelection(value: unknown, candidates: BriefCandidate[]): BriefSelection {
  if (!value || typeof value !== 'object') throw new Error('Invalid briefing selection.');
  const result = value as BriefSelection;
  for (const { id } of sections) {
    const chosen = result[id];
    if (!Array.isArray(chosen) || chosen.length < 1 || chosen.length > (id === 'outlook' ? 2 : 1) || new Set(chosen).size !== chosen.length || chosen.some(key => !candidates.some(c => c.id === key && c.section === id))) throw new Error('The AI selection was not grounded in this brief.');
  }
  if(candidates.some(c=>c.id==='fact:value-development') && !result.development.includes('fact:value-development'))throw new Error('The AI omitted observed portfolio development.');
  if(result.outlook.filter(id=>candidates.find(c=>c.id===id)?.contextId?.startsWith('news:')).length>1)throw new Error('Choose one news item and, optionally, one research view.');
  if (candidates.some(c => c.id === 'scope') && (!result.health.includes('scope') || !result.actions.includes('agenda:actions'))) throw new Error('The AI omitted the unresolved portfolio scope.');
  return result;
}
