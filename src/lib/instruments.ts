import type { Holding } from './types';

export function instrumentLabel(type: string) {
  if (type === 'Investment fund') return 'Fund / ETF';
  if (type === 'Shares') return 'Company shares';
  if (type === 'Dividend right certificates' || type === 'Participation certificate') return 'Company equity';
  if (type === 'Bonds, debt register claims') return 'Bond';
  if (type.startsWith('Hybrids/')) return 'Structured product';
  return type || 'Unknown instrument';
}

export function displayInstrumentName(name: string, type: string) {
  if (['Shares', 'Dividend right certificates', 'Participation certificate'].includes(type)) {
    return name.replace(/^(?:Namen-Aktie|Inhaber-Aktie|Na\. u\. Inh\. Ti\.-Aktie|Genussschein|Partizipationsschein)\s*/i, '').replace(/^-[A-Z]-?\s+/, '');
  }
  if (type === 'Investment fund') {
    const parts = name.split(/\s+-\s+/);
    if (parts.length > 1) return parts.at(-1)!.trim();
    return name.replace(/^(?:Anteile|Accum Shs|Shs|Units)\s*/i, '').replace(/^-[^-]*-\s*/, '');
  }
  return name;
}

export function underlyingCompanies(holding: Holding, scopeWeightAvailable: boolean) {
  return (holding.fundHoldings?.holdings || []).map((company, index) => ({
    ...company, id: `${holding.id}-company-${index}`,
    // A partial list must keep the published weights, never scale it up to 100%.
    scopeWeight: scopeWeightAvailable ? holding.weight * company.weight : null,
    estimatedValue: holding.value == null ? null : holding.value * company.weight,
  })).sort((a, b) => b.weight - a.weight);
}
