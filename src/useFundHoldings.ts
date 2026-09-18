import { lookThrough } from './lib/advisory';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Analysis, Dataset } from './lib/types';
import type { FundLookupState } from './FundGraph';

export function useFundHoldings(analysis: Analysis | null, setDataset: Dispatch<SetStateAction<Dataset | null>>) {
  const [status, setStatus] = useState<Record<string, FundLookupState>>({});
  const pending = useRef(new Map<string, Promise<void>>());
  const load = useCallback((isin: string, refresh = false): Promise<void> => {
    const existing = pending.current.get(isin);
    if (existing) return existing;
    setStatus(s => ({ ...s, [isin]: { status: 'loading' } }));
    const job = (async () => {
      try {
        const response = await fetch(`/api/fund-holdings?isin=${encodeURIComponent(isin)}${refresh ? '&refresh=true' : ''}`, { signal: AbortSignal.timeout(12000) });
        const result = await response.json();
        if (!response.ok || !result.snapshot) throw new Error(result.error || 'No verified holdings returned.');
        setDataset(d => !d ? d : ({ ...d, reference: { ...d.reference, FundHoldings: [...(d.reference.FundHoldings || []).filter(s => s.isin !== isin), result.snapshot] } }));
        setStatus(s => ({ ...s, [isin]: { status: 'ready', elapsedMs: result.elapsedMs } }));
      } catch (e) {
        setStatus(s => ({ ...s, [isin]: { status: 'unavailable', message: e instanceof Error ? e.message : 'Lookup unavailable.' } }));
      } finally { pending.current.delete(isin); }
    })();
    pending.current.set(isin, job);
    return job;
  }, [setDataset]);
  const missing = [...new Set((analysis?.holdings || []).filter(h => h.instrumentType === 'Investment fund' && /shares|equit/i.test(h.asset) && lookThrough(h).status === 'unavailable' && h.isin && !h.fundHoldings).map(h => h.isin!))].sort().join(',');
  const attempted = useRef(new Set<string>());
  useEffect(() => {
    const queue = missing.split(',').filter(isin => isin && !attempted.current.has(isin));
    queue.forEach(isin => attempted.current.add(isin));
    const worker = async () => { for (let isin = queue.shift(); isin; isin = queue.shift()) await load(isin); };
    void Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  }, [missing, load]);
  return { status, refresh: (isin: string) => { void load(isin, true); } };
}
