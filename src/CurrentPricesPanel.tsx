import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Analysis } from './lib/types';
import './current-prices.css';

import type { useInstrumentQuotes } from './useInstrumentQuotes';
import { isValidIsin } from './lib/securityIdentity';
const observation=(value?:string)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC':'Observation time unavailable';

export function CurrentPricesPanel({analysis,market}:{analysis:Analysis;market:ReturnType<typeof useInstrumentQuotes>}) {
  const [all,setAll]=useState(false);
  const {instruments}=market;
  const quotes=new Map(market.quotes.map(q=>[q.isin,q]));
  const available=market.quotes.filter(q=>q.state==='available'&&q.price!=null).length;
  const unidentifiable=analysis.holdings.filter(h=>!h.isin||!isValidIsin(h.isin)).length;
  return <section className="panel current-prices" aria-label="Latest instrument prices"><div className="panel-heading"><div><span className="eyebrow">DATED MARKET OBSERVATIONS</span><h3>Latest instrument prices</h3></div><button className="ws-icon" aria-label="Refresh instrument prices" disabled={market.loading} onClick={market.refresh}><RefreshCw size={15}/></button></div>
    <p className="microcopy">{market.loading?`Checking ISINs · ${market.quotes.length}/${instruments.length} complete`:`${available}/${instruments.length} instruments with available prices`} · Exchange quotes and fund NAVs have their own observation dates. Imported position values are unchanged.</p>
    <div className="current-price-list">{(all?instruments:instruments.slice(0,6)).map(instrument=>{const q=quotes.get(instrument.isin),hasPrice=q?.state!=='unavailable'&&q?.price!=null&&Number.isFinite(q.price)&&q.price>0&&q.currency;return <article key={instrument.isin} className="current-price-row"><div><strong>{instrument.name}</strong><small>{instrument.isin}{q?.symbol?` · ${q.symbol}`:''}{q?.exchange?` · ${q.exchange}`:''} · {instrument.type}</small>{q?.name&&q.name!==instrument.name&&<small>Provider name: {q.name}</small>}</div><div className="current-price-observation"><b>{hasPrice?`${q!.price!.toLocaleString('en-US',{maximumFractionDigits:4})} ${q!.currency}`:q?'Unavailable':'Checking…'}</b><small>{q?.kind==='nav'?'Fund NAV':q?.kind==='exchange'?'Exchange quote':''}{q?.state==='stale'?' · Stale observation':''}</small></div><p>{q?`${observation(q.asOf)} · ${q.message}${q.resolution?` ${q.resolution}`:''}`:'Waiting for provider lookup.'}{q?.url&&/^https?:\/\//.test(q.url)&&<> <a href={q.url} target="_blank" rel="noreferrer">{q.source||'Original source'} ↗</a></>}</p></article>;})}</div>
    {instruments.length>6&&<button className="text-button" onClick={()=>setAll(v=>!v)}>{all?'Show top 6':`Show all ${instruments.length} instruments`}</button>}
    {!instruments.length&&<p className="microcopy">No valid ISINs are available for price lookup in this scope.</p>}{unidentifiable>0&&<p className="microcopy">{unidentifiable} position{unidentifiable===1?'':'s'} without a valid ISIN could not be checked.</p>}
  </section>;
}
