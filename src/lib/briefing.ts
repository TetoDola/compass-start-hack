import type { Analysis, Evidence } from './types.ts';
import { portfolioExposures } from './portfolio';
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
export interface ContextItem { id: string; kind: 'news' | 'house-view'; title: string; source: string; url: string; publishedAt: string; retrievedAt: string; entityIds: string[]; relevance: string; summary?: string; sample?: boolean; provider: string; event?: MaterialEvent }
export interface MarketContext { items: ContextItem[]; checked: number; requested: number; totalEligible?: number; warnings: string[]; elapsedMs: number; fetchedAt: string; providers: string[]; checkedIds?: string[]; windowDays?: number }
export interface BriefCandidate { id: string; section: SectionKey; text: string; sourceIds: string[]; findingId?: string; contextId?: string }
export interface BriefSelection { development: string[]; health: string[]; outlook: string[]; actions: string[] }
export interface BriefResult { selection: BriefSelection; mode: 'structured' | 'ai-selected'; message: string; elapsedMs: number }

export const instrumentId = (isin: string | undefined, fallback: string) => isin ? `instrument:${isin}` : fallback;
export function newsTargets(a: Analysis): NewsTarget[] {
  const result = new Map<string, NewsTarget>();
  const put = (target: NewsTarget) => { const old = result.get(target.id); if (!old) result.set(target.id, target); else { old.weight = old.weight == null || target.weight == null ? null : old.weight + target.weight; old.via = [...new Set([old.via, target.via])].join(' · '); } };
  for (const h of a.holdings) {
    if (['Shares', 'Dividend right certificates', 'Participation certificate'].includes(h.instrumentType)) put({ id: instrumentId(h.isin, h.id), name: h.displayName, isin: h.isin, via: 'Direct position', weight: a.weightsAvailable ? h.weight : null });
    for (const [i, c] of (h.fundHoldings?.holdings || []).entries()) put({ id: instrumentId(c.isin, `underlying:${h.isin || h.id}:${i}`), name: c.name, isin: c.isin, via: h.displayName, weight: a.weightsAvailable ? h.weight * c.weight : null });
  }
  const companies = [...result.values()].sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const categories = (['industry', 'country', 'region'] as const).flatMap(kind => portfolioExposures(a, kind).map(e => ({ id: e.id, name: e.name, kind, via: `${kind} exposure`, weight: e.weight })));
  return [...companies, ...categories];
}
export function contextEvidence(item: ContextItem): Evidence {
  return { id: item.id, type: 'record', title: item.title, location: item.url, date: item.publishedAt, fields: [{ label: 'Publisher / source', value: item.source }, { label: 'Published', value: dateLabel(item.publishedAt, true) }, { label: 'Relevance', value: item.relevance }, { label: 'Feed', value: item.provider }, ...(item.summary ? [{ label: 'Context', value: item.summary }] : [])], note: item.kind === 'house-view' ? 'Public research sample; not the adviser’s bank-approved house view. Check the date before applying it.' : 'Headline-level coverage. Entity relevance is inferred, not proof of portfolio impact or causality. Open the article to verify its context.' };
}
const short = (s: string, max = 25) => { const words = s.split(/\s+/); return words.length > max ? words.slice(0, max).join(' ') + '…' : s; };
export function briefingCandidates(a: Analysis, context?: MarketContext | null): BriefCandidate[] {
  const candidates: BriefCandidate[] = [];
  const add = (c: BriefCandidate) => candidates.push(c);
  for (const f of a.findings) {
    let text = short(f.body, 31);
    if (f.id === 'customer-context') { const e = f.evidence[0]; text = `${short(e.fields.find(f => f.label === 'Note')?.value || f.body, 22)} Recorded ${dateLabel(e.date, true)}; reconfirm.`; }
    if (f.id === 'recorded-issues') text = `${a.violations.length} recorded review points need checking. Reported liquidity: ${money(a.liquidity, a.currency)}. These are supplied findings, not new breaches.`;
    if (f.id === 'largest-holding') text = `${a.holdings[0].displayName} is the largest position at ${percent(a.holdings[0].weight)}; check this against the intended allocation.`;
    add({ id: `fact:${f.id}`, section: f.section === 'happened' ? 'development' : 'health', text, sourceIds: [...(f.id === 'recorded-issues' ? a.portfolios.map(p => `p-${p.PortfolioId}`) : []), ...f.evidence.map(e => e.id)], findingId: f.id });
    add({ id: `action:${f.id}`, section: 'actions', text: short(f.question, 31), sourceIds: f.evidence.map(e => e.id), findingId: f.id });
  }
  if (a.scopeAmbiguous) add({ id: 'scope', section: 'health', text: 'A consolidated view overlaps another portfolio. Select one portfolio before combining totals, liquidity or exposure weights.', sourceIds: a.portfolios.map(p => `p-${p.PortfolioId}`) });
  if (!candidates.some(c => c.section === 'development')) add({ id: 'no-history', section: 'development', text: 'No dated advisory history was supplied. Start by confirming the customer’s current objectives.', sourceIds: [] });
  for (const item of [...(context?.items.filter(i => i.kind === 'news') || [])].sort((a,b) => Number(!!materialEvent(b.title))-Number(!!materialEvent(a.title))).slice(0, 11).concat(context?.items.filter(i => i.kind === 'house-view') || [])) add({ id: item.id, section: 'outlook', text: item.kind === 'news' ? `${short(item.title, 20)} (${dateLabel(item.publishedAt, true)}). ${item.relevance.split('. Potential relevance')[0]}. Impact unverified.` : `Public research sample · ${dateLabel(item.publishedAt, true)}: ${item.title}. Relevant to technology exposure; confirm your bank’s current view.`, sourceIds: [item.id], contextId: item.id });
  if (!context?.items.length) add({ id: 'no-outlook', section: 'outlook', text: context ? 'No recent matching news was verified. No bank-approved house view has been supplied.' : 'Refresh the brief to check current news. No bank-approved house view has been supplied.', sourceIds: [] });
  return candidates;
}
export function defaultSelection(candidates: BriefCandidate[]): BriefSelection {
  const first = (section: SectionKey, preferred?: string) => candidates.find(c => c.section === section && c.id === preferred)?.id || candidates.find(c => c.section === section)?.id;
  const health = first('health', 'scope');
  const outlook = candidates.filter(c => c.section === 'outlook');
  return { development: [first('development', 'fact:value-development')!], health: [health!], outlook: [...outlook.filter(c => c.id.startsWith('news:')).slice(0, 1), ...outlook.filter(c => c.id.startsWith('house:')).slice(0, 1), ...outlook.filter(c => c.id === 'no-outlook')].map(c => c.id), actions: [first('actions', 'action:customer-context')!] };
}
// AI selects source-backed sentences; it cannot invent amounts, trades, deadlines or causal claims.
export function validateSelection(value: unknown, candidates: BriefCandidate[]): BriefSelection {
  if (!value || typeof value !== 'object') throw new Error('Invalid briefing selection.');
  const result = value as BriefSelection;
  for (const { id } of sections) {
    const chosen = result[id];
    if (!Array.isArray(chosen) || chosen.length < 1 || chosen.length > (id === 'outlook' ? 2 : 1) || new Set(chosen).size !== chosen.length || chosen.some(key => !candidates.some(c => c.id === key && c.section === id))) throw new Error('The AI selection was not grounded in this brief.');
  }
  if (candidates.some(c => c.id === 'scope') && !result.health.includes('scope')) throw new Error('The AI omitted the unresolved portfolio scope.');
  return result;
}
