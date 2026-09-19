export type MarketPeriod = '1W' | '1M' | '3M' | '1Y';
export const marketPeriods: MarketPeriod[] = ['1W', '1M', '3M', '1Y'];

export interface MarketObservation { date: string; value: number }
export interface MarketMove { change: number; start: string; end: string }

export function marketChange(observations: MarketObservation[], period: MarketPeriod): { start: MarketObservation; end: MarketObservation; change: number } | null {
  const end = observations.at(-1);
  if (!end || !Number.isFinite(end.value) || end.value <= 0) return null;
  const target = new Date(`${end.date}T00:00:00Z`);
  if (!Number.isFinite(target.getTime())) return null;
  if (period === '1W') target.setUTCDate(target.getUTCDate() - 7);
  else {
    const months = period === '1M' ? 1 : period === '3M' ? 3 : 12;
    const originalDay = target.getUTCDate();
    const endOfMonth = originalDay === new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(1);
    target.setUTCMonth(target.getUTCMonth() - months);
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(endOfMonth ? lastDay : Math.min(originalDay, lastDay));
  }
  const baseline = [...observations].reverse().find(point => {
    const time = Date.parse(`${point.date}T00:00:00Z`);
    return Number.isFinite(time) && time <= target.getTime() && target.getTime() - time <= 7 * 86400000 && Number.isFinite(point.value) && point.value > 0;
  });
  return baseline ? { start: baseline, end, change: (end.value / baseline.value - 1) * 100 } : null;
}

/** Indicative price movement of quoted holdings linked to one exposure, never an index or portfolio return. */
export function linkedHoldingMove(parts: { weight: number; move?: MarketMove }[], totalWeight: number): { change: number; coverage: number } | null {
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;
  const covered = parts.filter(part => part.weight > 0 && Number.isFinite(part.weight) && part.move && Number.isFinite(part.move.change));
  const weight = covered.reduce((sum, part) => sum + part.weight, 0);
  const coverage = weight / totalWeight;
  if (coverage < 0.5 || coverage > 1.001) return null;
  const ends = covered.map(part => Date.parse(`${part.move!.end}T00:00:00Z`));
  const starts = covered.map(part => Date.parse(`${part.move!.start}T00:00:00Z`));
  if ([...ends, ...starts].some(time => !Number.isFinite(time)) || Math.max(...ends) - Math.min(...ends) > 5 * 86400000 || Math.max(...starts) - Math.min(...starts) > 8 * 86400000) return null;
  return { change: covered.reduce((sum, part) => sum + part.weight * part.move!.change, 0) / weight, coverage };
}
