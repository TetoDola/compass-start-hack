import type { Analysis, Dataset, Evidence, Holding, Row } from './types';
import { dateLabel, list, number, percent } from './format';
import { portfolioExposures, violationEvidence, violationMeasurement, type Exposure, type ExposureKind } from './portfolio';
import { materialEvent } from './events';
import { contextEvidence, newsTargets, type MarketContext } from './briefing';
import { notePriority } from './analysis';
import { enrichRelevance } from './research';

const saaDimension: Partial<Record<ExposureKind, string>> = { industry: 'Industry', country: 'CountryGroup' };
const quotedName = (code: unknown) => /"([^"]+)"/.exec(String(code || ''))?.[1];
const policyCategory=(holding:Holding,kind:ExposureKind)=>kind==='industry'?holding.saaIndustry:kind==='country'?holding.saaRegion:undefined;

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

// A fund's SAA category describes the product, not its underlying sector/region.
// The export supplies no denominator or policy-taxonomy crosswalk for mixed assets.
// Only a fully classified, reconciled direct-equity scope establishes a comparable
// denominator without guessing; recorded rule findings remain independently usable.
function policyRows(analysis:Analysis,dataset:Dataset,kind:ExposureKind) {
  if(!analysis.weightsAvailable)return [];
  const targets=saaTargets(analysis,dataset,kind);
  const equities=new Set(['Shares','Dividend right certificates','Participation certificate']);
  const holdingsInScope=analysis.holdings.filter(h=>h.weight>0);
  if(!holdingsInScope.length||holdingsInScope.some(h=>!equities.has(h.instrumentType)||!targets.has(policyCategory(h,kind)||'')))return [];
  if(Math.abs(holdingsInScope.reduce((sum,h)=>sum+h.weight,0)-1)>.001||Math.abs([...targets.values()].reduce((sum,target)=>sum+target,0)-1)>.001||[...targets.values()].some(target=>target<0||target>1))return [];
  return [...targets].flatMap(([name,target])=>{
    const holdings=holdingsInScope.filter(h=>policyCategory(h,kind)===name);
    if(!holdings.length)return [];
    const weight=holdings.reduce((sum,h)=>sum+h.weight,0);
    const evidence:Evidence={id:`policy:${kind}:${name}`,title:`${name} strategic allocation comparison`,type:'calculation',location:`reference.json / StrategicAssetAllocations / Id=${analysis.portfolios[0].StrategicAssetAllocationId}`,fields:[{label:'Policy dimension',value:saaDimension[kind]!},{label:'Policy category',value:name},{label:'Supplied target',value:percent(target,2)},{label:'Classified position weight',value:percent(weight,2)}],note:'Uses complete retained SAA classifications in a direct-equity portfolio whose position weights and policy targets each reconcile to 100%. Fund product classifications and partial look-through are not used for computed policy comparisons.'};
    return [{id:`policy:${kind}:${name}`,name,target,weight,deviation:weight-target,holdings,evidence:[evidence,...holdings.map(h=>h.evidence)]}];
  });
}

/** One exposure dimension with its supplied target, deviation, recorded finding and news count. */
export function breakdownRows(analysis: Analysis, dataset: Dataset, kind: ExposureKind, context?: MarketContext | null): BreakdownRow[] {
  const policies=policyRows(analysis,dataset,kind);
  return portfolioExposures(analysis, kind).map(exposure => {
    const policy=policies.find(p=>p.holdings.length===exposure.contributions.length&&p.holdings.every(h=>exposure.contributions.some(c=>c.id===h.id&&Math.abs(c.weight-h.weight)<1e-8)));
    const target = policy?.target ?? null;
    return {
      ...exposure,
      evidence:policy?[...new Map([...exposure.evidence,...policy.evidence].map(e=>[e.id,e])).values()]:exposure.evidence,
      target,
      deviation: target == null ? null : exposure.weight - target,
      violation: analysis.violations.find(v => { const quoted = quotedName(v.RuleCode); return !!quoted && (quoted === exposure.name || quoted === policy?.name); }),
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
  const enriched=context?enrichRelevance(context,targets):undefined;
  return (enriched?.items || []).filter(item => item.kind === 'news'&&!item.sample).map(item => {
    const companies = targets.filter(t => item.entityIds.includes(t.id) && (!t.kind || t.kind === 'company'));
    // A category headline touches a whole exposure bucket, never one identified holding — say which.
    const named = companies.length ? companies : targets.filter(t => item.entityIds.includes(t.id));
    const weight = item.exposureWeight ?? null;
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
    .flatMap(kind => policyRows(analysis, dataset, kind))
    .sort((a, b) => Math.abs(b.deviation!) - Math.abs(a.deviation!));
  const drift = drifts[0];
  if (drift && Math.abs(drift.deviation!) >= 0.02) prompts.push({
    id: `drift:${drift.id}`,
    level: 'gap',
    label: 'Off the strategic target',
    title: `${drift.deviation! < 0 ? 'Close' : 'Reduce'} the ${drift.name} ${drift.deviation! < 0 ? 'underweight' : 'overweight'}`,
    detail: `${percent(drift.weight, 1)} in the supplied SAA security classification against a ${percent(drift.target!, 1)} strategic target — ${percent(Math.abs(drift.deviation!), 1)} ${drift.deviation! < 0 ? 'short' : 'over'}. Direct-equity holdings and policy targets each reconcile to 100%.`,
    action: 'Compare the deviation with the agreed tolerance before proposing a trade.',
    evidence: drift.evidence,
  });
  const event = portfolioEvents(analysis, context).find(e => e.severity);
  if (event) prompts.push({
    id: `event:${event.id}`,
    level: 'warning',
    label: `Live event · ${event.severity}`,
    title: event.title,
    detail: `${event.names.slice(0, 3).join(', ')}${event.weight == null ? '' : ` · ${percent(event.weight, 2)} ${event.match === 'company' ? 'covered company exposure' : 'largest matched classification; overlaps not added'}`} · ${event.source} · ${dateLabel(event.publishedAt, true)}.`,
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
