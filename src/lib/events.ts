import type { ContextItem } from './briefing';
export interface MaterialEvent { label: string; severity: 'critical' | 'review' }
// Headline triage, not a claim that an event or its portfolio impact has been verified.
export function materialEvent(title: string): MaterialEvent | undefined {
  if (/\b(avoids?|averts?|denies?|denied|no longer|not|unlikely|rumou?rs?|could|may|might|if|fears?|risk of|emerges? from|exits?)\b.{0,55}\b(bankrupt|insolven|default|administration)|\b(bankruptcy|insolvency|default).{0,30}\b(avoided|averted|denied|rumou?r)\b/i.test(title) || /\?|\bhow to\b|\bwhat if\b/i.test(title)) return undefined;
  if (/\b(files? for|filed for|filing for|declares?|declared|enters?|entered|seeks?|sought)\b.{0,30}\b(bankruptcy|chapter 11|insolvency|administration)|\b(defaults?|defaulted) on\b|\bdeclared bankrupt\b|\bgoes? bankrupt\b/i.test(title)) return { label: 'Distress report — verify', severity: 'critical' };
  if (/\b(trading (?:is |was )?(?:halted|suspended)|dividend (?:cut|suspended)|cuts? (?:its )?(?:guidance|forecast)|fraud (?:charges|investigation)|recalls?|seized|seizure|nationali[sz]ation)\b/i.test(title)) return { label: 'Material event — verify', severity: 'review' };
  return undefined;
}

export function compareNews(a: ContextItem, b: ContextItem): number {
  // Specific ownership links outrank broad geography; weight is not event impact.
  return Number(b.matchKind==='company')-Number(a.matchKind==='company')
    || Number(!!materialEvent(b.title))-Number(!!materialEvent(a.title))
    || (b.exposureWeight||0)-(a.exposureWeight||0)
    || b.publishedAt.localeCompare(a.publishedAt);
}
