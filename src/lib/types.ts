export type Row = Record<string, any>;
export interface FundBreakdown { id: number; total: number; sectors: Record<string, number>; regions: Record<string, number> }
export interface FundHoldingSnapshot { isin: string; name: string; asOf: string; retrievedAt: string; sourceName: string; sourceUrl: string; coverage: 'top-holdings' | 'complete'; holdings: { name: string; isin?: string; weight: number; country?: string }[] }
export interface Dataset {
  version: string;
  clients: Row[];
  reference: { Securities: Row[]; RiskProfiles: Row[]; StrategicAssetAllocations: Row[]; FundBreakdowns: FundBreakdown[]; FundHoldings?: FundHoldingSnapshot[] };
}
export interface Evidence {
  id: string; title: string; location: string; date?: string;
  type: 'record' | 'calculation'; fields: { label: string; value: string }[]; note?: string;
}
export interface Entity { id: string; label: string; value?: string; type: 'client' | 'portfolio' | 'holding' | 'exposure' | 'note' | 'proposal' | 'issue' | 'metric'; evidenceId?: string }
export interface Connection { from: string; to: string; label: string }
export interface Finding {
  id: string; section: 'happened' | 'now'; title: string; body: string;
  kind: 'context' | 'attention' | 'insight'; tag: string; metric?: string;
  question: string; evidence: Evidence[]; entities: Entity[]; connections: Connection[];
}
export interface Holding {
  id: string; name: string; securityId: number; portfolio: string; portfolioId: number;
  currency: string; value: number | null; weight: number; asset: string; sector: string; country?: string;
  known: boolean; evidence: Evidence;
  instrumentType: string; displayName: string; isin?: string; priceDate?: string; priceStale?: boolean; fundBreakdown?: FundBreakdown; fundHoldings?: FundHoldingSnapshot;
  riskContribution?: number;
}
export interface Analysis {
  customer: Row; portfolios: Row[]; scope: string; currency: string;
  aum: number | null; liquidity: number | null; scopeAmbiguous: boolean; weightsAvailable: boolean;
  holdings: Holding[]; findings: Finding[]; evidence: Evidence[];
  history: { date: string; value: number }[]; historyCurrency: string;
  allocations: { label: string; weight: number }[];
  fundCoverage: number; fundSectors: { label: string; weight: number }[];
  notes: Row[]; proposals: Row[]; violations: Row[]; unresolved: number;
  warnings: string[]; summary: string; strategy: string;
}
