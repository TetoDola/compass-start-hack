import type { MarketMove, MarketPeriod } from './marketPerformance';
export interface QuoteInstrument { isin: string; name: string; type: string }
export interface InstrumentQuote {
  isin: string;
  state: 'available' | 'stale' | 'unavailable';
  symbol?: string;
  name?: string;
  price?: number;
  currency?: string;
  asOf?: string;
  retrievedAt: string;
  source?: string;
  url?: string;
  kind?: 'exchange' | 'nav';
  exchange?: string;
  resolution?: string;
  message: string;
  movements?: Partial<Record<MarketPeriod, MarketMove>>;
}
export interface QuoteResponse { quotes: InstrumentQuote[]; fetchedAt: string }
