import type { IncomingMessage, ServerResponse } from 'node:http';
import { isValidIsin } from '../src/lib/securityIdentity';
import type { InstrumentQuote, QuoteInstrument, QuoteResponse } from '../src/lib/quotes';
import { marketChange, marketPeriods, type MarketObservation } from '../src/lib/marketPerformance.ts';

const SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const equities = new Set(['Shares', 'Dividend right certificates', 'Participation certificate']);
interface Listing { symbol: string; name: string; type: 'EQUITY'|'ETF'|'MUTUALFUND'; exchange?: string; resolution?: string }
const supported = (type: string) => type === 'Investment fund' || equities.has(type);
const compatible = (type: string, quoteType: string) => type === 'Investment fund' ? ['ETF', 'MUTUALFUND'].includes(quoteType) : equities.has(type) && quoteType === 'EQUITY';

export function parseIsinListing(raw: unknown, instrument: QuoteInstrument): Listing {
  if (!isValidIsin(instrument.isin)) throw new Error('Invalid ISIN check digit. Verify the source identifier.');
  if (!supported(instrument.type)) throw new Error('Current quotes are supported for equities and funds; this instrument needs an asset-specific price source.');
  const quotes = (raw as {quotes?: unknown[]})?.quotes;
  if (!Array.isArray(quotes)) throw new Error('The ISIN search did not return a usable listing.');
  const candidates = quotes.filter((q: any) => q && q.isYahooFinance === true && (q.isin == null || q.isin === instrument.isin) && typeof q.symbol === 'string' && /^[A-Za-z0-9.^=_-]{1,40}$/.test(q.symbol) && compatible(instrument.type, q.quoteType)) as any[];
  const unique = [...new Map(candidates.map(q => [q.symbol, q])).values()];
  if (unique.length !== 1) throw new Error(unique.length ? 'The ISIN search returned multiple listings. A verified listing selection is required.' : 'No compatible listing was found for this ISIN. The instrument may be private, delisted or outside provider coverage.');
  const q = unique[0];
  return {symbol:q.symbol, name:String(q.longname || q.shortname || instrument.name).slice(0,250), type:q.quoteType, exchange:typeof q.exchDisp==='string'?q.exchDisp.slice(0,80):undefined};
}

/** Restrict the fallback to unambiguous US common-stock composites; exchange suffixes are not guessed. */
export function parseFigiListing(raw: any, instrument: QuoteInstrument): Listing {
  if(!isValidIsin(instrument.isin)||!instrument.isin.startsWith('US')||!equities.has(instrument.type))throw new Error('No supported exact-ISIN mapping.');
  const rows=Array.isArray(raw)&&raw.length===1&&Array.isArray(raw[0]?.data)?raw[0].data:[];
  const candidates=rows.filter((r:any)=>r.exchCode==='US'&&r.marketSector==='Equity'&&r.securityType2==='Common Stock'&&typeof r.ticker==='string'&&/^[A-Z]{1,6}$/.test(r.ticker)&&typeof r.shareClassFIGI==='string');
  const unique=[...new Map(candidates.map((r:any)=>[`${r.ticker}:${r.shareClassFIGI}`,r])).values()] as any[];
  if(unique.length!==1)throw new Error('No unambiguous US common-stock mapping was returned for this ISIN.');
  const r=unique[0];
  return {symbol:r.ticker,name:String(r.name||instrument.name).slice(0,250),type:'EQUITY',exchange:'US composite',resolution:`OpenFIGI exact-ISIN mapping to US common stock (${r.shareClassFIGI}); quote supplied by Yahoo Finance.`};
}

export function parseInstrumentQuote(raw: any, instrument: QuoteInstrument, listing: Listing, now = Date.now()): InstrumentQuote {
  const chart = raw?.chart?.result?.[0], meta = chart?.meta;
  if (raw?.chart?.error || meta?.symbol !== listing.symbol || !compatible(instrument.type, meta.instrumentType) || meta.instrumentType !== listing.type) throw new Error('The quote did not match the resolved listing and instrument type.');
  const price = meta.regularMarketPrice, timestamp = meta.regularMarketTime * 1000;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || typeof meta.regularMarketTime !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now || typeof meta.currency !== 'string' || !/^[A-Za-z]{3}$/.test(meta.currency)) throw new Error('The provider did not supply a valid positive price, currency and observation time.');
  const kind = listing.type === 'MUTUALFUND' ? 'nav' : 'exchange';
  const stale = now - timestamp > (kind === 'nav' ? 7 : 4) * 86400000;
  const observations: MarketObservation[] = Array.isArray(chart?.timestamp) && Array.isArray(chart?.indicators?.quote?.[0]?.close)
    ? chart.timestamp.flatMap((seconds: unknown, index: number) => {
      const close = chart.indicators.quote[0].close[index], time = typeof seconds === 'number' ? seconds * 1000 : NaN;
      return Number.isFinite(time) && time <= now && typeof close === 'number' && Number.isFinite(close) && close > 0 ? [{ date: new Date(time).toISOString().slice(0, 10), value: close }] : [];
    }).sort((a: MarketObservation, b: MarketObservation) => a.date.localeCompare(b.date)) : [];
  const movements = Object.fromEntries(marketPeriods.flatMap(period => {
    const result = marketChange(observations, period);
    return result ? [[period, { change: result.change, start: result.start.date, end: result.end.date }]] : [];
  }));
  return {isin:instrument.isin, state:stale?'stale':'available', symbol:listing.symbol, name:listing.name, price, currency:meta.currency, asOf:new Date(timestamp).toISOString(), retrievedAt:new Date(now).toISOString(), source:'Yahoo Finance', url:`https://finance.yahoo.com/quote/${encodeURIComponent(listing.symbol)}/`, kind, exchange:listing.exchange, movements, resolution:listing.resolution||'Single compatible listing returned by an exact-ISIN Yahoo search; no name-derived ticker.', message:`${kind==='nav'?'Latest published fund NAV':'Latest exchange observation'}; ${stale?'older than the freshness threshold. ':''}may be delayed or reflect the last market close. ${meta.currency==='GBp'?'GBp means British pence, not pounds. ':meta.currency==='ZAc'?'ZAc means South African cents. ':''}Provider-selected listing and currency may differ from the portfolio record. Imported valuations are unchanged.`};
}

export function createQuoteResolver(request: typeof fetch = fetch, clock = Date.now) {
  const listings = new Map<string,{listing:Listing;at:number}>();
  const cache = new Map<string,{quote:InstrumentQuote;at:number}>();
  const pending = new Map<string,Promise<InstrumentQuote>>();
  let mappingAttempts:number[]=[];
  async function get(url: URL | string) {
    const response = await request(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error('Price provider is temporarily unavailable. Try refreshing later.');
    return response.json();
  }
  return async (instrument: QuoteInstrument, refresh = false): Promise<InstrumentQuote> => {
    const now=clock(), key=`${instrument.isin}:${instrument.type}`;
    const unavailable=(message:string):InstrumentQuote=>({isin:instrument.isin,state:'unavailable',retrievedAt:new Date(clock()).toISOString(),message});
    if(!isValidIsin(instrument.isin))return unavailable('Invalid ISIN check digit. Verify the source identifier.');
    if(!supported(instrument.type))return unavailable('Current quotes are supported for equities and funds; this instrument needs an asset-specific price source.');
    const old=cache.get(key);
    if(!refresh&&old&&now-old.at<(old.quote.state==='unavailable'?30000:60000))return old.quote;
    if(pending.has(key))return pending.get(key)!;
    const job=(async()=>{
      try {
        const saved=listings.get(key);
        let listing=saved&&!refresh&&now-saved.at<86400000?saved.listing:undefined;
        if(!listing){
          const url=new URL(SEARCH);
          url.search=new URLSearchParams({q:instrument.isin,quotesCount:'10',newsCount:'0',enableFuzzyQuery:'false'}).toString();
          try { listing=parseIsinListing(await get(url),instrument); }
          catch(error) {
            if(!instrument.isin.startsWith('US')||!equities.has(instrument.type))throw error;
            mappingAttempts=mappingAttempts.filter(at=>clock()-at<60000);
            if(mappingAttempts.length>=20)throw new Error('ISIN mapping request limit reached. Refresh after one minute.');
            mappingAttempts.push(clock());
            const response=await request('https://api.openfigi.com/v3/mapping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([{idType:'ID_ISIN',idValue:instrument.isin,exchCode:'US'}]),signal:AbortSignal.timeout(5000)});
            if(!response.ok)throw new Error('ISIN mapping provider is temporarily unavailable.');
            listing=parseFigiListing(await response.json(),instrument);
          }
          if(listings.size>=1000)listings.delete(listings.keys().next().value!);
          listings.set(key,{listing,at:clock()});
        }
        const url=new URL(`${CHART}${encodeURIComponent(listing.symbol)}`);
        url.search=new URLSearchParams({interval:'1d',range:'2y'}).toString();
        return parseInstrumentQuote(await get(url),instrument,listing,clock());
      }catch(error){
        // Do not relabel a cached/reference price as a successful fresh observation.
        return unavailable(error instanceof Error&& !/fetch|abort|timeout|JSON/i.test(error.message)?error.message:'Price lookup failed or timed out. No current price is available.');
      }
    })();
    pending.set(key,job);
    try{const quote=await job;if(cache.size>=1000)cache.delete(cache.keys().next().value!);cache.set(key,{quote,at:clock()});return quote;}finally{pending.delete(key);}
  };
}

export function instrumentQuotesMiddleware() {
  const resolve=createQuoteResolver();
  return async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
    if(new URL(req.url||'/','http://localhost').pathname!=='/api/instrument-quotes')return next();
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'){res.statusCode=405;res.end(JSON.stringify({error:'POST required'}));return;}
    try {
      let body='';for await(const chunk of req){body+=chunk;if(body.length>32000)throw new Error('Request too large');}
      const value=JSON.parse(body);
      if(!Array.isArray(value.instruments)||value.instruments.length>20||value.instruments.some((i:any)=>!i||typeof i.isin!=='string'||i.isin.length>20||typeof i.name!=='string'||i.name.length>250||typeof i.type!=='string'||i.type.length>80)||(value.refresh!==undefined&&typeof value.refresh!=='boolean'))throw new Error('Supply up to 20 instruments with ISIN, name and type.');
      const instruments:QuoteInstrument[]=value.instruments;
      const quotes:InstrumentQuote[]=new Array(instruments.length);let index=0;
      await Promise.all(Array.from({length:Math.min(4,instruments.length)},async()=>{for(let i=index++;i<instruments.length;i=index++)quotes[i]=await resolve(instruments[i],value.refresh===true);}));
      const result:QuoteResponse={quotes,fetchedAt:new Date().toISOString()};res.end(JSON.stringify(result));
    }catch{res.statusCode=400;res.end(JSON.stringify({error:'Invalid quote request. Supply up to 20 instruments with ISIN, name and type.'}));}
  };
}
