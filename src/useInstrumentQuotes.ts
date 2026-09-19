import { useEffect, useMemo, useState } from 'react';
import type { Analysis } from './lib/types';
import type { InstrumentQuote, QuoteResponse } from './lib/quotes';
import { isValidIsin } from './lib/securityIdentity';

export function useInstrumentQuotes(analysis: Analysis) {
  const instruments = useMemo(() => [...new Map(analysis.holdings.filter(h => h.isin && isValidIsin(h.isin)).map(h => [h.isin!, { isin: h.isin!, name: h.displayName, type: h.instrumentType }])).values()], [analysis.holdings]);
  const key = JSON.stringify([analysis.customer.ClientId, analysis.scope, instruments]);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{ key: string; quotes: InstrumentQuote[]; loading: boolean }>({ key: '', quotes: [], loading: true });
  useEffect(() => {
    const abort = new AbortController();
    setState({ key, quotes: [], loading: instruments.length > 0 });
    let next = 0;
    async function load() {
      while (next < instruments.length && !abort.signal.aborted) {
        const offset = next; next += 8;
        const batch = instruments.slice(offset, offset + 8);
        let quotes: InstrumentQuote[];
        try {
          const response = await fetch('/api/instrument-quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35000)]), body: JSON.stringify({ instruments: batch, refresh: refresh > 0 }) });
          if (!response.ok) throw new Error('Quote service unavailable');
          const payload = await response.json() as QuoteResponse;
          quotes = batch.map(instrument => payload.quotes.find(q => q.isin === instrument.isin) || { isin: instrument.isin, state: 'unavailable', retrievedAt: new Date().toISOString(), message: 'No verified quote returned for this ISIN.' });
        } catch {
          if (abort.signal.aborted) return;
          quotes = batch.map(instrument => ({ isin: instrument.isin, state: 'unavailable', retrievedAt: new Date().toISOString(), message: 'Quote lookup failed. Retry to check the original provider.' }));
        }
        if (!abort.signal.aborted) setState(previous => ({ key, quotes: [...(previous.key === key ? previous.quotes : []), ...quotes], loading: (previous.key === key ? previous.quotes.length : 0) + quotes.length < instruments.length }));
      }
    }
    void Promise.all([load(), load()]);
    return () => abort.abort();
  }, [key, refresh]);
  const current = state.key === key ? state : { key, quotes: [] as InstrumentQuote[], loading: true };
  return { instruments, quotes: current.quotes, loading: current.loading, refresh: () => setRefresh(n => n + 1) };
}
