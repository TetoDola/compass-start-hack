import { analyze } from './analysis';
import { newsTargets, type ContextItem, type NewsTarget } from './briefing';
import { clientName, list } from './format';
import { materialEvent } from './events';
import { matchesNewsTarget } from './newsMatching';
import type { Dataset, Evidence } from './types';

export const OUTREACH_WINDOW = 7 * 86400000;
export const OUTREACH_VERSION = 'outreach-v1';
export const eventLabels = {
  distress: 'Corporate distress', material: 'Material corporate event', earnings: 'Earnings',
  policy: 'Policy & regulation', disruption: 'Disruption', general: 'Market context',
} as const;
export type EventType = keyof typeof eventLabels;
export type ReportStatus = 'reported' | 'speculation' | 'denial' | 'unclear';
export interface Article {
  id: string; title: string; summary: string; source: string; url: string; publishedAt: string;
  layer: 'news' | 'shipping' | 'disaster'; sources: { name: string; url: string }[];
}
export interface Classification {
  type: EventType; status: ReportStatus; evidence: string;
  matches: { targetId: string; evidence: string }[];
  eventDate: string | null; eventDateEvidence: string | null;
  timing: 'ongoing' | 'deadline' | 'none'; timingEvidence: string | null; deadline: string | null;
  mode: 'minimax' | 'rules';
}
export interface ClassifiedArticle { article: Article; classification: Classification }
export interface ClassificationInput { article: Article; targets: NewsTarget[] }
export interface ClientScope {
  clientId: number; name: string; scope: string; scopeName: string; snapshot?: string;
  targets: NewsTarget[]; partialFunds: boolean;
  recordEvidence?: Evidence[];
}
export interface Recommendation {
  clientId: number; name: string; scope: string; scopeName: string; snapshot?: string;
  target: NewsTarget; urgency: number; components: { label: string; points: number; max: number; reason: string }[];
  limitations: string[]; evidence: string; article: Article;
  recordEvidence: Evidence[];
}
export interface Development { id: string; articles: ClassifiedArticle[]; recommendations: Recommendation[] }
export type OutreachStatus = 'contacted' | 'dismissed';
export type OutreachHistory = Record<string, { status: OutreachStatus; at: string }>;

// Keys identify public search queries, never merge portfolio security identities.
export function publicTargetId(t: NewsTarget): string {
  return `${t.kind || 'company'}:${t.isin || t.name.normalize('NFKC').trim().toLowerCase()}`;
}
export function buildOutreachBook(dataset: Dataset): { scopes: ClientScope[]; targets: NewsTarget[] } {
  const scopes: ClientScope[] = [], catalog = new Map<string, NewsTarget>();
  for (const client of dataset.clients) {
    const combined = analyze(dataset, client);
    const analyses = combined.scopeAmbiguous ? list(client.Portfolios).map(p => analyze(dataset, client, String(p.PortfolioId))) : [combined];
    for (const a of analyses) {
      const targets = newsTargets(a).map(t => ({ ...t, id: publicTargetId(t) }));
      for (const t of targets) {
        const old = catalog.get(t.id);
        catalog.set(t.id, { id: t.id, name: t.name, isin: t.isin, kind: t.kind, aliases: [...new Set([...(old?.aliases || []), ...(t.aliases || []), ...(old && old.name !== t.name ? [old.name] : [])])].slice(0, 30), via: 'Public news screening', weight: null });
      }
      scopes.push({ clientId: client.ClientId, name: clientName(client), scope: a.scope, scopeName: a.scope === 'all' ? 'All compatible portfolios' : String(a.portfolios[0]?.PortfolioNr || a.scope), snapshot: a.portfolios.map(p => p.FactoryDateUtc).filter(Boolean).sort()[0], targets, recordEvidence: a.evidence.filter(e => a.portfolios.some(p => e.id === `p-${p.PortfolioId}`)), partialFunds: a.holdings.some(h => h.instrumentType === 'Investment fund' && h.fundHoldings?.coverage !== 'complete') });
    }
  }
  return { scopes, targets: [...catalog.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
export function recentPublication(date: string, now = Date.now()): boolean {
  const time = Date.parse(date);
  return Number.isFinite(time) && time <= now && time >= now - OUTREACH_WINDOW;
}
export function canonicalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return; }
}
const normalizedTitle = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function normalizeArticles(items: ContextItem[], now = Date.now()): Article[] {
  const articles: Article[] = [];
  for (const item of [...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.url.localeCompare(b.url))) {
    const url = canonicalUrl(item.url);
    if (item.kind !== 'news' || item.sample || !url || !recentPublication(item.publishedAt, now)) continue;
    const title = item.title.slice(0, 500), layer = item.layer || 'news';
    const same = articles.find(a => a.layer === layer && (layer !== 'news' ? a.id === item.id : a.url === url || (normalizedTitle(a.title) === normalizedTitle(title) && Math.abs(Date.parse(a.publishedAt) - Date.parse(item.publishedAt)) < 86400000)));
    if (same) {
      if (!same.sources.some(s => s.url === url)) same.sources.push({ name: item.source, url });
      // A changed headline at the same URL is a new version, not a second alert.
      if (same.url === url && Date.parse(item.publishedAt) >= Date.parse(same.publishedAt)) Object.assign(same, { title, summary: (item.summary || '').slice(0, 3000), publishedAt: item.publishedAt });
      continue;
    }
    articles.push({ id: layer === 'news' ? `${layer}:${url}` : item.id, title, summary: (item.summary || '').slice(0, 3000), source: item.source, url, publishedAt: item.publishedAt, layer, sources: [{ name: item.source, url }] });
  }
  return articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}
export function articleText(article: Article): string { return `${article.title}\n${article.summary}`; }
export function candidateTargets(article: Article, targets: NewsTarget[]): NewsTarget[] {
  return targets.filter(target => matchesNewsTarget(article, target));
}
export function ruleClassification({ article, targets }: ClassificationInput): Classification {
  const event = materialEvent(article.title);
  const doubtful = /\?|\b(could|may|might|rumou?rs?|denies?|denied|not|avoids?|averts?|fears?|risk of)\b/i.test(article.title);
  return { type: event?.severity === 'critical' ? 'distress' : event ? 'material' : article.layer !== 'news' ? 'disruption' : 'general', status: doubtful ? 'unclear' : event ? 'reported' : 'unclear', evidence: article.title, matches: candidateTargets(article, targets).map(t => ({ targetId: t.id, evidence: article.title.includes(t.name) ? article.title : articleText(article) })), eventDate: null, eventDateEvidence: null, timing: 'none', timingEvidence: null, deadline: null, mode: 'rules' };
}
export function scoreRecommendation(row: ClassifiedArticle, scope: ClientScope, target: NewsTarget, now = Date.now()): Recommendation | undefined {
  const { classification: c, article } = row;
  const match = c.matches.find(m => m.targetId === target.id);
  if (!match || !recentPublication(article.publishedAt, now)) return;
  const company = !target.kind || target.kind === 'company';
  const direct = company && target.via.includes('Direct position');
  const strength = direct ? 3 : company ? 2 : 1;
  const significance = ({ distress: 3, material: 2, earnings: 1, policy: 2, disruption: 2, general: 0 } as const)[c.type];
  const knownWeight = target.weight != null && Number.isFinite(target.weight) && target.weight >= 0 && target.weight <= 1;
  const materiality = knownWeight ? target.weight! >= .1 ? 2 : target.weight! >= .03 ? 1 : 0 : 0;
  const deadline = c.deadline ? Date.parse(c.deadline) : NaN;
  const age = now - Date.parse(article.publishedAt);
  const timing = c.timing === 'deadline' && deadline > now && deadline <= now + 7 * 86400000 ? (deadline <= now + 2 * 86400000 ? 2 : 1) : c.timing === 'ongoing' && age <= 2 * 86400000 ? 1 : 0;
  const components = [
    { label: 'Client connection', points: strength, max: 3, reason: direct ? 'Direct holding in supplied records' : company ? 'Covered fund constituent' : 'Broad category exposure only' },
    { label: 'Event significance', points: significance, max: 3, reason: eventLabels[c.type] },
    { label: 'Exposure materiality', points: materiality, max: 2, reason: knownWeight ? `${(target.weight! * 100).toFixed(1)}% of the stated scope; thresholds 3% / 10%` : 'Weight unavailable; no materiality points assigned' },
    { label: 'Time sensitivity', points: timing, max: 2, reason: timing ? c.timing === 'deadline' ? `Source deadline ${c.deadline}` : 'Source describes an ongoing event, reported within 48 hours' : 'No current, evidenced time-sensitive trigger' },
  ];
  const limitations: string[] = [];
  let cap = 10;
  if (!company) { cap = Math.min(cap, 6); limitations.push('Category context only; urgency capped at 6.'); }
  if (c.status !== 'reported') { cap = Math.min(cap, 3); limitations.push(`${c.status} report; urgency capped at 3.`); }
  if (c.mode === 'rules') { cap = Math.min(cap, 6); limitations.push('Conservative rules fallback; urgency capped at 6 pending classification.'); }
  if (c.eventDate && Date.parse(c.eventDate) < now - OUTREACH_WINDOW && timing === 0) { cap = Math.min(cap, 3); limitations.push('Older event republished without a current timed trigger; capped at 3.'); }
  if (!knownWeight) limitations.push('Exposure weight is unknown.');
  if (scope.partialFunds) limitations.push('Fund look-through is partial; only supplied constituents are covered.');
  return { clientId: scope.clientId, name: scope.name, scope: scope.scope, scopeName: scope.scopeName, snapshot: scope.snapshot, target, urgency: Math.min(cap, Math.max(1, components.reduce((sum, c) => sum + c.points, 0))), components, limitations, evidence: match.evidence, article, recordEvidence: target.classificationEvidence?.length ? target.classificationEvidence : scope.recordEvidence || [] };
}
function similarTitles(a: string, b: string): boolean {
  const x = new Set(normalizedTitle(a).split(' ')), y = new Set(normalizedTitle(b).split(' '));
  return [...x].filter(w => y.has(w)).length / new Set([...x, ...y]).size >= .8;
}
export function buildDevelopments(rows: ClassifiedArticle[], scopes: ClientScope[], now = Date.now()): Development[] {
  const groups: ClassifiedArticle[][] = [];
  for (const row of [...rows].filter(r => recentPublication(r.article.publishedAt, now)).sort((a, b) => a.article.publishedAt.localeCompare(b.article.publishedAt) || a.article.id.localeCompare(b.article.id))) {
    const signature = (r: ClassifiedArticle) => JSON.stringify([r.classification.type, r.classification.status, r.classification.eventDate, r.classification.deadline, r.classification.matches.map(m => m.targetId).sort()]);
    const group = groups.find(g => signature(g[0]) === signature(row) && Math.abs(Date.parse(g[0].article.publishedAt) - Date.parse(row.article.publishedAt)) < 86400000 && similarTitles(g[0].article.title, row.article.title));
    if (group) group.push(row); else groups.push([row]);
  }
  return groups.map(articles => {
    const clients = new Map<number, Recommendation>();
    for (const row of articles) for (const scope of scopes) for (const target of scope.targets) {
      const recommendation = scoreRecommendation(row, scope, target, now);
      const old = clients.get(scope.clientId);
      if (recommendation && (!old || recommendation.urgency > old.urgency || (recommendation.urgency === old.urgency && target.id.localeCompare(old.target.id) < 0))) clients.set(scope.clientId, recommendation);
    }
    const recommendations = [...clients.values()].sort((a, b) => b.urgency - a.urgency || a.name.localeCompare(b.name));
    const first = articles[0];
    // Identical syndicated coverage shares an action. Changed headline/status/deadline creates a new version.
    const id = JSON.stringify([normalizedTitle(first.article.title), first.article.publishedAt.slice(0, 10), first.classification.type, first.classification.status, first.classification.deadline]);
    return { id, articles, recommendations };
  }).filter(d => d.recommendations.length).sort((a, b) => b.recommendations[0].urgency - a.recommendations[0].urgency || b.articles[0].article.publishedAt.localeCompare(a.articles[0].article.publishedAt) || a.id.localeCompare(b.id));
}
export function statusKey(development: Development, client: Recommendation): string { return JSON.stringify([development.id, client.clientId, client.name, client.scope, client.target.id, client.target.weight]); }
export function conversationStarter(recommendation: Recommendation): string {
  return `I wanted to check in about “${recommendation.article.title}”. Your supplied portfolio records list ${recommendation.target.name} (${recommendation.target.via}). Are these records still current, and would it be helpful to discuss whether this development changes any of your priorities?`;
}
