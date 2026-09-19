import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Analysis } from './lib/types';
import './current-prices.css';

import type { InstrumentQuote, QuoteResponse } from './lib/quotes';
import { isValidIsin } from './lib/securityIdentity';
const observation=(value?:string)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC':'Observation time unavailable';

export function CurrentPricesPanel({analysis}:{analysis:Analysis}) {
  const instruments=useMemo(()=>[...new Map(analysis.holdings.filter(h=>h.isin&&isValidIsin(h.isin)).map(h=>[h.isin!,{isin:h.isin!,name:h.displayName,type:h.instrumentType}])).values()],[analysis.holdings]);
  const key=JSON.stringify([analysis.customer.ClientId,analysis.scope,instruments]);
  const [refresh,setRefresh]=useState(0),[all,setAll]=useState(false);
  const [state,setState]=useState<{key:string;quotes:InstrumentQuote[];loading:boolean}>({key:'',quotes:[],loading:true});
  useEffect(()=>{
    const abort=new AbortController();
    setState({key,quotes:[],loading:instruments.length>0});
    setAll(false);
    let next=0;
    async function load(){
      while(next<instruments.length&&!abort.signal.aborted){
        const offset=next; next+=8;
        const batch=instruments.slice(offset,offset+8);
        let quotes:InstrumentQuote[];
        try{
          const response=await fetch('/api/instrument-quotes',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(35000)]),body:JSON.stringify({instruments:batch,refresh:refresh>0})});
          if(!response.ok)throw new Error('Quote service unavailable');
          const payload=await response.json() as QuoteResponse;
          quotes=batch.map(instrument=>payload.quotes.find(q=>q.isin===instrument.isin)||{isin:instrument.isin,state:'unavailable',retrievedAt:new Date().toISOString(),message:'No verified quote returned for this ISIN.'});
        }catch{
          if(abort.signal.aborted)return;
          quotes=batch.map(instrument=>({isin:instrument.isin,state:'unavailable',retrievedAt:new Date().toISOString(),message:'Quote lookup failed. Retry to check the original provider.'}));
        }
        if(!abort.signal.aborted)setState(previous=>({key,quotes:[...(previous.key===key?previous.quotes:[]),...quotes],loading:(previous.key===key?previous.quotes.length:0)+quotes.length<instruments.length}));
      }
    }
    void Promise.all([load(),load()]);
    return()=>abort.abort();
  // key contains the complete request payload; reference-only fund updates must not restart it.
  },[key,refresh]);
  const current=state.key===key?state:{key,quotes:[],loading:true};
  const quotes=new Map(current.quotes.map(q=>[q.isin,q]));
  const available=current.quotes.filter(q=>q.state==='available'&&q.price!=null).length;
  const unidentifiable=analysis.holdings.filter(h=>!h.isin||!isValidIsin(h.isin)).length;
  return <section className="panel current-prices" aria-label="Latest instrument prices"><div className="panel-heading"><div><span className="eyebrow">DATED MARKET OBSERVATIONS</span><h3>Latest instrument prices</h3></div><button className="ws-icon" aria-label="Refresh instrument prices" disabled={current.loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15}/></button></div>
    <p className="microcopy">{current.loading?`Checking ISINs · ${current.quotes.length}/${instruments.length} complete`:`${available}/${instruments.length} instruments with available prices`} · Exchange quotes and fund NAVs have their own observation dates. Imported position values are unchanged.</p>
    <div className="current-price-list">{(all?instruments:instruments.slice(0,6)).map(instrument=>{const q=quotes.get(instrument.isin),hasPrice=q?.state!=='unavailable'&&q?.price!=null&&Number.isFinite(q.price)&&q.price>0&&q.currency;return <article key={instrument.isin} className="current-price-row"><div><strong>{instrument.name}</strong><small>{instrument.isin}{q?.symbol?` · ${q.symbol}`:''}{q?.exchange?` · ${q.exchange}`:''} · {instrument.type}</small>{q?.name&&q.name!==instrument.name&&<small>Provider name: {q.name}</small>}</div><div className="current-price-observation"><b>{hasPrice?`${q!.price!.toLocaleString('en-US',{maximumFractionDigits:4})} ${q!.currency}`:q?'Unavailable':'Checking…'}</b><small>{q?.kind==='nav'?'Fund NAV':q?.kind==='exchange'?'Exchange quote':''}{q?.state==='stale'?' · Stale observation':''}</small></div><p>{q?`${observation(q.asOf)} · ${q.message}${q.resolution?` ${q.resolution}`:''}`:'Waiting for provider lookup.'}{q?.url&&/^https?:\/\//.test(q.url)&&<> <a href={q.url} target="_blank" rel="noreferrer">{q.source||'Original source'} ↗</a></>}</p></article>;})}</div>
    {instruments.length>6&&<button className="text-button" onClick={()=>setAll(v=>!v)}>{all?'Show top 6':`Show all ${instruments.length} instruments`}</button>}
    {!instruments.length&&<p className="microcopy">No valid ISINs are available for price lookup in this scope.</p>}{unidentifiable>0&&<p className="microcopy">{unidentifiable} position{unidentifiable===1?'':'s'} without a valid ISIN could not be checked.</p>}
  </section>;
}
