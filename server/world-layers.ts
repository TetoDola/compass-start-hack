import type { ProviderConfig } from './providers';
import { loadKeyedWorldProviders } from './world-providers';
import type { WorldArticle, WorldChokepoint, WorldDigest, WorldLayerStatus, WorldQuote } from '../src/lib/world';

const DAY=86400000;
export const USGS='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson';
export const EONET='https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=100';
const MARITIME='https://msi.nga.mil/NavWarnings';
const safeUrl=(value:unknown):string|undefined=>{try{const u=new URL(String(value));return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return;}};
const point=(value:unknown):[number,number]|undefined=>Array.isArray(value)&&Number.isFinite(value[0])&&Number.isFinite(value[1])&&Math.abs(value[0])<=180&&Math.abs(value[1])<=90?[value[0],value[1]]:undefined;
const date=(value:unknown,now:number):string|undefined=>{const n=typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(n)&&n>0&&n<=now?new Date(n).toISOString():undefined;};

export function parseEarthquakes(raw:any,now=Date.now()):WorldArticle[] {
  return (Array.isArray(raw?.features)?raw.features:[]).flatMap((f:any)=>{
    const p=f.properties,location=point(f.geometry?.coordinates),publishedAt=date(p?.time,now),url=safeUrl(p?.url);
    if(!location||!publishedAt||!url||Date.parse(publishedAt)<now-30*DAY||!Number.isFinite(p?.mag))return [];
    return [{id:`quake:${String(f.id).slice(0,80)}`,title:`M${p.mag.toFixed(1)} earthquake · ${String(p.place||'Location supplied').slice(0,200)}`,source:'USGS',url,publishedAt,tickers:[],location,locationName:p.place,layer:'disaster' as const,summary:`Magnitude ${p.mag.toFixed(1)}; depth ${Number.isFinite(f.geometry?.coordinates?.[2])?`${f.geometry.coordinates[2]} km`:'unavailable'}. Location and magnitude are observations; company disruption is not established.`}];
  }).slice(0,600);
}
export function parseDisasters(raw:any,now=Date.now()):WorldArticle[] {
  return (Array.isArray(raw?.events)?raw.events:[]).flatMap((e:any)=>{
    const geometry=(Array.isArray(e.geometry)?e.geometry:[]).filter((g:any)=>g.type==='Point'&&date(g.date,now)).sort((a:any,b:any)=>Date.parse(b.date)-Date.parse(a.date))[0];
    const location=point(geometry?.coordinates),publishedAt=date(geometry?.date,now),url=safeUrl(e.sources?.[0]?.url)||safeUrl(e.link);
    if(!location||!publishedAt||!url||Date.parse(publishedAt)<now-30*DAY||typeof e.title!=='string')return [];
    const categories=(Array.isArray(e.categories)?e.categories:[]).map((c:any)=>c.title).filter((v:any)=>typeof v==='string').join(', ');
    return [{id:`natural:${String(e.id).slice(0,80)}`,title:e.title.slice(0,300),source:'NASA EONET',url,publishedAt,tickers:[],location,locationName:e.title.slice(0,100),layer:'disaster' as const,summary:`${categories}. Latest source-reported event location. An open event record does not establish damage to a portfolio company.`}];
  }).slice(0,100);
}
export function warningPoint(text:string):[number,number]|undefined {
  const m=text.match(/(\d{1,2})[-°](\d{1,2}(?:\.\d+)?)\s*([NS])\s+(\d{1,3})[-°](\d{1,2}(?:\.\d+)?)\s*([EW])/i);
  if(!m||Number(m[2])>=60||Number(m[5])>=60)return;
  return point([(Number(m[4])+Number(m[5])/60)*(m[6].toUpperCase()==='W'?-1:1),(Number(m[1])+Number(m[2])/60)*(m[3].toUpperCase()==='S'?-1:1)]);
}
export function parseWarnings(raw:any,now=Date.now()):WorldArticle[] {
  return (Array.isArray(raw?.warnings)?raw.warnings:[]).flatMap((w:any)=>{
    const publishedAt=date(w.issuedAt,now);
    if(!publishedAt||Date.parse(publishedAt)<now-30*DAY||(w.expiresAt>0&&w.expiresAt<now)||typeof w.text!=='string')return [];
    const location=warningPoint(w.text);
    return [{id:`maritime:${String(w.id).slice(0,80)}`,title:`${String(w.title||'Navigational warning').slice(0,100)} · ${w.text.split('\n').filter(Boolean).slice(0,2).join(' ').slice(0,140)}`,source:'NGA via World Monitor',url:safeUrl(w.url)||`${MARITIME}?warning=${encodeURIComponent(w.id)}`,publishedAt,tickers:[],location,locationName:'First coordinate in navigational warning; inspect full notice',layer:'shipping' as const,summary:w.text.slice(0,900)}];
  }).slice(0,200);
}
export function parseChokepoints(raw:any,now=Date.now()):WorldChokepoint[] {
  return (Array.isArray(raw?.chokepoints)?raw.chokepoints:[]).flatMap((c:any)=>{
    const coordinates=point([c.lon,c.lat]);if(!coordinates||typeof c.name!=='string')return [];
    // A configured baseline is not a current disruption observation.
    const observed=!raw.upstreamUnavailable&&c.transitSummary?.dataAvailable===true&&date(raw.fetchedAt,now)&&now-Date.parse(raw.fetchedAt)<DAY;
    return [{id:String(c.id),name:c.name,coordinates,routes:(Array.isArray(c.affectedRoutes)?c.affectedRoutes:[]).filter((v:any)=>typeof v==='string').slice(0,10),status:observed?'reported' as const:'reference' as const,asOf:observed?raw.fetchedAt:undefined,detail:observed?String(c.description||'Inspect source for coverage.'):'Reference waterway. Current transit/disruption data unavailable; no operational status inferred.',url:'https://www.worldmonitor.app/docs/methodology/chokepoints'}];
  }).slice(0,30);
}
export function parseQuote(raw:any,name:string,now=Date.now()):WorldQuote|undefined {
  const r=raw?.chart?.result?.[0],m=r?.meta,asOf=date(typeof m?.regularMarketTime==='number'?m.regularMarketTime*1000:undefined,now);
  if(!m||!Number.isFinite(m.regularMarketPrice)||!asOf||typeof m.symbol!=='string')return;
  const change=Number.isFinite(m.regularMarketChangePercent)?m.regularMarketChangePercent:null;
  return {symbol:m.symbol,name,price:m.regularMarketPrice,change,asOf,currency:m.currency,source:'Yahoo Finance',url:`https://finance.yahoo.com/quote/${encodeURIComponent(m.symbol)}/`,sparkline:(r.indicators?.quote?.[0]?.close||[]).filter((v:any)=>Number.isFinite(v)).slice(-30)};
}

export async function loadWorldLayers(config:ProviderConfig,request:typeof fetch=fetch):Promise<Pick<WorldDigest,'signals'|'quotes'|'chokepoints'|'layers'>> {
  const now=Date.now(),signals:WorldArticle[]=[],layers:WorldLayerStatus[]=[];
  let chokepoints:WorldChokepoint[]=[],quotes:WorldQuote[]=[];
  async function get(url:string,local=false){
    const response=await request(url,{headers:{'User-Agent':'Compass/1.0',...(local&&config.WORLDMONITOR_API_KEY?{'X-WorldMonitor-Key':config.WORLDMONITOR_API_KEY}:{})},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Source unavailable');return response.json();
  }
  const tasks=[
    {id:'earthquakes',label:'Earthquakes',url:USGS,parse:parseEarthquakes},
    {id:'natural',label:'Storms, fires & volcanoes',url:EONET,parse:parseDisasters},
    ...(config.WORLDMONITOR_BASE_URL?[{id:'maritime',label:'Maritime warnings',url:new URL('/api/maritime/v1/list-navigational-warnings',config.WORLDMONITOR_BASE_URL).href,parse:parseWarnings}]:[]),
  ];
  const outcomes=await Promise.allSettled([
    (async()=>{const keyed=await loadKeyedWorldProviders(config,request);signals.push(...keyed.signals);quotes.push(...keyed.quotes);layers.push(...keyed.layers);})(),
    ...tasks.map(async task=>{try{const raw=await get(task.url,task.id==='maritime');const rows=task.parse(raw,now);signals.push(...rows);layers.push({id:task.id,label:task.label,state:rows.length?'available':'unavailable',count:rows.length,message:rows.length?`${rows.length} source-dated records in the last 30 days.`:task.id==='maritime'?'No recent warnings returned; older notices are excluded.':'No recent source-dated events returned.',sourceUrl:task.id==='maritime'?MARITIME:task.url});}catch{layers.push({id:task.id,label:task.label,state:'unavailable',count:0,message:'Source could not be reached.',sourceUrl:task.id==='maritime'?MARITIME:task.url});}}),
    (async()=>{try{if(!config.WORLDMONITOR_BASE_URL)throw new Error();const raw=await get(new URL('/api/supply-chain/v1/get-chokepoint-status',config.WORLDMONITOR_BASE_URL).href,true);chokepoints=parseChokepoints(raw,now);layers.push({id:'chokepoints',label:'Shipping chokepoints',state:chokepoints.some(c=>c.status==='reported')?'partial':chokepoints.length?'stale':'unavailable',count:chokepoints.length,message:chokepoints.some(c=>c.status==='reported')?'Reported transit observations; inspect source coverage.':'Reference locations only; current transit and disruption data unavailable.',sourceUrl:'https://www.worldmonitor.app/docs/methodology/chokepoints'});}catch{layers.push({id:'chokepoints',label:'Shipping chokepoints',state:'unavailable',count:0,message:'Local World Monitor unavailable.',sourceUrl:'https://www.worldmonitor.app/docs/methodology/chokepoints'});}})(),
    (async()=>{const symbols=[['^GSPC','S&P 500'],['^VIX','VIX'],['GC=F','Gold'],['CL=F','WTI oil'],['NG=F','Natural gas']];const results=await Promise.allSettled(symbols.map(async([symbol,name],i)=>{await new Promise(r=>setTimeout(r,i*160));return parseQuote(await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`),name,now);}));const marketQuotes=results.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]);quotes.push(...marketQuotes);layers.push({id:'markets',label:'Market observations',state:marketQuotes.length===symbols.length?'available':marketQuotes.length?'partial':'unavailable',count:marketQuotes.length,message:'Latest provider observation; may be delayed. Own timestamps and session changes, independent of the case history.',sourceUrl:'https://finance.yahoo.com/markets/'});})(),
  ]);
  // Each source records its own failure; one unavailable source never removes another layer.
  for(const outcome of outcomes)if(outcome.status==='rejected')layers.push({id:'source-error',label:'External source',state:'unavailable',count:0,message:'Unexpected source response.',sourceUrl:'https://www.worldmonitor.app/docs/data-sources'});
  return {signals:signals.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)),quotes,chokepoints,layers};
}
