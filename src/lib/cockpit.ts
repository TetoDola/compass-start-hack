import type { Analysis, Dataset, Evidence, Holding, Row } from './types';
import { dateLabel, list, number, percent } from './format';
import { portfolioExposures, violationEvidence, violationMeasurement, type Exposure, type ExposureKind } from './portfolio';
import { materialEvent } from './events';
import { contextEvidence, newsTargets, type MarketContext } from './briefing';
import { notePriority } from './analysis';

// Strategic targets are set against the coarser SAA taxonomy. These three pairs are the
// same bucket under a different label; every other name stays untargeted rather than guessed.
const targetAlias: Record<string, string> = {
  'Raw materials': 'Materials',
  'Communication Services': 'Telecommunication Services',
  'United Kingdom': 'Great Britain',
};
const saaDimension: Partial<Record<ExposureKind, string>> = { industry: 'Industry', country: 'CountryGroup' };
const quotedName = (code: unknown) => /"([^"]+)"/.exec(String(code || ''))?.[1];

/** Supplied policy targets for one exposure dimension. Empty unless a single portfolio is in scope. */
export function saaTargets(analysis: Analysis, dataset: Dataset, kind: ExposureKind): Map<string, number> {
  const dimension = saaDimension[kind];
  const result = new Map<string, number>();
  if (!dimension || analysis.portfolios.length !== 1) return result;
  const saa = dataset.reference.StrategicAssetAllocations.find(s => s.Id === analysis.portfolios[0].StrategicAssetAllocationId);
  for (const mapping of list(saa?.Mappings)) {
    const target = number(mapping.TargetPercentage);
    if (mapping.Dimension === dimension && target != null && !result.has(mapping.Category)) result.set(mapping.Category, target);
  }
  return result;
}

export interface BreakdownRow extends Exposure {
  target: number | null;
  deviation: number | null;
  violation?: Row;
  newsCount: number;
}

/** One exposure dimension with its supplied target, deviation, recorded finding and news count. */
export function breakdownRows(analysis: Analysis, dataset: Dataset, kind: ExposureKind, context?: MarketContext | null): BreakdownRow[] {
  const targets = saaTargets(analysis, dataset, kind);
  return portfolioExposures(analysis, kind).map(exposure => {
    const target = targets.get(targetAlias[exposure.name] || exposure.name) ?? targets.get(exposure.name) ?? null;
    return {
      ...exposure,
      target,
      deviation: target == null ? null : exposure.weight - target,
      violation: analysis.violations.find(v => { const quoted = quotedName(v.RuleCode); return !!quoted && (quoted === exposure.name || quoted === targetAlias[exposure.name]); }),
      newsCount: (context?.items || []).filter(i => i.entityIds.includes(exposure.id)).length,
    };
  });
}

/** Positions ranked by their supplied contribution to portfolio volatility. */
export function riskContributors(analysis: Analysis): Holding[] {
  return analysis.holdings.filter(h => (h.riskContribution ?? 0) > 0).sort((a, b) => b.riskContribution! - a.riskContribution!);
}

export interface CockpitEvent { id: string; title: string; source: string; publishedAt: string; url: string; names: string[]; weight: number | null; match: 'company' | 'category'; severity?: string; evidence: Evidence }

/** Live headlines matched to holdings, ranked by the portfolio weight they touch. */
export function portfolioEvents(analysis: Analysis, context?: MarketContext | null): CockpitEvent[] {
  const targets = newsTargets(analysis);
  return (context?.items || []).filter(item => item.kind === 'news').map(item => {
    const companies = targets.filter(t => item.entityIds.includes(t.id) && (!t.kind || t.kind === 'company'));
    // A category headline touches a whole exposure bucket, never one identified holding — say which.
    const named = companies.length ? companies : targets.filter(t => item.entityIds.includes(t.id));
    const weight = named.length && named.every(t => t.weight != null) ? named.reduce((sum, t) => sum + t.weight!, 0) : null;
    return { id: item.id, title: item.title, source: item.source, publishedAt: item.publishedAt, url: item.url, names: named.map(t => t.name), weight, match: companies.length ? 'company' as const : 'category' as const, severity: materialEvent(item.title)?.label, evidence: contextEvidence(item) };
  }).filter(e => e.names.length).sort((a, b) => Number(!!b.severity) - Number(!!a.severity) || Number(a.match === 'category') - Number(b.match === 'category') || (b.weight || 0) - (a.weight || 0));
}

export interface CockpitPrompt { id: string; level: 'breach' | 'warning' | 'gap' | 'note'; label: string; title: string; detail: string; action: string; evidence: Evidence[]; exposureId?: string }

/** Suggested next steps, each traced to a recorded finding, a policy target or a customer note. */
export function cockpitPrompts(analysis: Analysis, dataset: Dataset, context?: MarketContext | null): CockpitPrompt[] {
  const prompts: CockpitPrompt[] = [];
  const grouped = new Map<string, Row[]>();
  for (const v of analysis.violations) { const key = String(v.RuleCode || 'Recorded suitability issue'); grouped.set(key, [...(grouped.get(key) || []), v]); }
  for (const [code, records] of grouped) {
    const worst = records.find(v => v.Severity === 'Error') || records[0];
    const measurement = violationMeasurement(worst);
    prompts.push({
      id: `rule:${code}`,
      level: worst.Severity === 'Error' ? 'breach' : 'warning',
      label: worst.Severity === 'Error' ? 'Recorded breach' : 'Recorded warning',
      title: code,
      detail: `${records.length} supplied record${records.length === 1 ? '' : 's'}${measurement ? ` · ${measurement}` : ''}. Last flagged ${dateLabel(worst.LastViolatedDateUTC, true)}; current resolution is unknown.`,
      action: 'Check the recorded limit, then prepare a proposal for the affected positions.',
      evidence: records.map(v => violationEvidence(analysis, v)),
    });
  }
  const drifts = (['industry', 'country'] as const)
    .flatMap(kind => breakdownRows(analysis, dataset, kind).filter(row => row.deviation != null))
    .sort((a, b) => Math.abs(b.deviation!) - Math.abs(a.deviation!));
  const drift = drifts[0];
  if (drift && Math.abs(drift.deviation!) >= 0.02) prompts.push({
    id: `drift:${drift.id}`,
    level: 'gap',
    label: 'Off the strategic target',
    title: `${drift.deviation! < 0 ? 'Close' : 'Reduce'} the ${drift.name} ${drift.deviation! < 0 ? 'underweight' : 'overweight'}`,
    detail: `${percent(drift.weight, 1)} held against a ${percent(drift.target!, 1)} strategic target — ${percent(Math.abs(drift.deviation!), 1)} ${drift.deviation! < 0 ? 'short' : 'over'}.`,
    action: 'Compare the deviation with the agreed tolerance before proposing a trade.',
    evidence: drift.evidence,
    exposureId: drift.id,
  });
  const event = portfolioEvents(analysis, context).find(e => e.severity);
  if (event) prompts.push({
    id: `event:${event.id}`,
    level: 'warning',
    label: `Live event · ${event.severity}`,
    title: event.title,
    detail: `${event.names.slice(0, 3).join(', ')}${event.weight == null ? '' : ` · ${percent(event.weight, 2)} ${event.match === 'company' ? 'held directly' : 'in this exposure category'}`} · ${event.source} · ${dateLabel(event.publishedAt, true)}.`,
    action: 'Open the article, verify the affected entity, then review the linked positions.',
    evidence: [event.evidence],
  });
  const note = [...analysis.notes].sort((a, b) => notePriority(b.Note) - notePriority(a.Note))[0];
  if (note) prompts.push({
    id: 'note',
    level: 'note',
    label: `Customer note · ${dateLabel(note.CreatedByDateUTC, true)}`,
    title: 'Carry the recorded preference into the next proposal',
    detail: note.Note,
    action: 'Reconfirm the preference, then screen the holdings it applies to.',
    evidence: analysis.evidence.filter(e => e.id.startsWith('note-') && e.date === note.CreatedByDateUTC),
  });
  const rank = { breach: 0, warning: 1, gap: 2, note: 3 };
  return prompts.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, 5);
}
