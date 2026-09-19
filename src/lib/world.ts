import type { Analysis } from './types';
import { instrumentId, type ContextItem, type MarketContext, type NewsTarget } from './briefing';
import { portfolioExposures } from './portfolio';
import { enrichRelevance } from './research';
import { materialEvent } from './events';

export interface WorldArticle { id:string; title:string; source:string; url:string; publishedAt:string; summary?:string; tickers:string[]; location?:[number,number]; locationName?:string; layer?:'news'|'shipping'|'disaster' }
export interface WorldQuote { symbol:string; name:string; price:number; change:number|null; asOf?:string; currency?:string; source:string; url:string; sparkline:number[] }
export interface WorldChokepoint { id:string; name:string; coordinates:[number,number]; routes:string[]; status:'reference'|'reported'; detail:string; asOf?:string; url:string }
export interface WorldLayerStatus { id:string; label:string; state:'available'|'partial'|'stale'|'unavailable'; count:number; message:string; sourceUrl:string }
export interface WorldDigest { articles:WorldArticle[]; signals?:WorldArticle[]; quotes?:WorldQuote[]; chokepoints?:WorldChokepoint[]; layers?:WorldLayerStatus[]; state:'complete'|'partial'|'stale'|'unavailable'|'unconfigured'; generatedAt?:string; retrievedAt:string; message:string }
export interface WorldStatus { state:WorldDigest['state']; generatedAt?:string; retrievedAt:string; articles:number; matched:number; message:string; globalItems?:ContextItem[]; quotes?:WorldQuote[]; chokepoints?:WorldChokepoint[]; layers?:WorldLayerStatus[] }
const countryAliases:Record<string,string[]>={
  'United States':['United States of America','USA','U.S.','U.S.A.'], 'United Kingdom':['UK','U.K.','Britain'],
  'Switzerland':['Swiss'], 'China':['Chinese'], 'Germany':['German'], 'Japan':['Japanese'],
  'France':['French'], 'Taiwan':['Taiwanese'], 'South Korea':['Korea, Republic of','Republic of Korea'],
  'Russia':['Russian Federation'], 'Czechia':['Czech Republic'], 'Netherlands':['The Netherlands'],
};
export function countryKey(name:string):string {
  const n=name.trim().toLowerCase();
  return Object.entries(countryAliases).find(([key,aliases])=>[key,...aliases].some(a=>a.toLowerCase()===n))?.[0].toLowerCase() || n;
}
function mentioned(text:string,phrase:string):boolean {
  const p=phrase.trim(); if(p.length<3)return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^\\p{L}\\p{N}])`,p.length<=4?'u':'iu').test(text);
}
export function matchesWorldArticle(article:WorldArticle,target:NewsTarget):boolean {
  const text=`${article.title} ${article.summary || ''}`;
  if((target.kind||'company')==='company') {
    if(target.symbol && article.tickers.includes(target.symbol.toUpperCase()))return true;
    // Keep full legal names; strip only legal suffixes, never guess a ticker from an ISIN.
    const name=target.name.replace(/\s+(Inc\.?|Corporation|Corp\.?|Ltd\.?|PLC|AG|SA|SE)(?:\s.*)?$/i,'').trim();
    if(['equatorial','visa','shell','meta','alphabet','apple','target'].includes(name.toLowerCase())&&!/\b(company|shares?|stocks?|earnings|revenue|ceo|corporate|nasdaq|nyse|investors?|profits?|dividends?|technology)\b/i.test(text))return mentioned(text,target.name)&&target.name!==name;
    return name.length>=4 && mentioned(text,name);
  }
  // Country mentions alone can be travel, sport or photo captions. Require an economic or disruption topic.
  if(target.kind==='country'||target.kind==='region') {
    if(!/\b(market|stocks?|bonds?|banks?|banking|finance|financial|economy|economic|inflation|interest rates?|tariffs?|trade|exports?|imports?|sanctions?|currency|investments?|investors?|earnings|recession|gdp|oil|gas|energy|supply|shipping|war|conflict|earthquake|floods?|outage|strike|bankruptcy|default)\b/i.test(text))return false;
  }
  const aliases=target.kind==='country'?Object.entries(countryAliases).find(([key])=>countryKey(key)===countryKey(target.name))?.[1]||[]:[];
  return [target.name,...aliases].some(name=>mentioned(target.kind==='industry'?article.title:text,name));
}
export function worldContext(digest:WorldDigest,targets:NewsTarget[],days:number,now=Date.now()):MarketContext {
  const items:ContextItem[]=[]; const seen=new Set<string>();
  for(const article of [...digest.articles,...digest.signals||[]]) {
    const date=Date.parse(article.publishedAt); if(!Number.isFinite(date)||date>now||date<now-days*86400000||seen.has(article.url))continue;
    const linked=targets.filter(t=>matchesWorldArticle(article,t));
    seen.add(article.url);
    items.push({id:article.id,kind:'news',layer:article.layer||'news',title:article.title,source:article.source,url:article.url,publishedAt:article.publishedAt,retrievedAt:digest.retrievedAt,summary:article.summary,entityIds:linked.map(t=>t.id),provider:article.layer&&article.layer!=='news'?article.source:'World Monitor · self-hosted RSS',relevance:linked.length?'Source text matched to portfolio entities. Geographic or industry relevance does not establish an operating dependency or a price effect.':'Global event; no supported portfolio connection identified.',event:materialEvent(article.title),geo:article.location?{coordinates:article.location,label:article.locationName||'Source location',basis:article.layer&&article.layer!=='news'?'event-location':'article-location'}:undefined});
  }
  const enriched=enrichRelevance({items,checked:0,requested:targets.length,warnings:[],elapsedMs:0,fetchedAt:digest.retrievedAt,providers:['World Monitor']},targets);
  const matched=enriched.items.filter(i=>i.entityIds.length);
  return {...enriched,items:matched,world:{state:digest.state,generatedAt:digest.generatedAt,retrievedAt:digest.retrievedAt,articles:digest.articles.length,matched:matched.length,message:digest.message,globalItems:enriched.items,quotes:digest.quotes,chokepoints:digest.chokepoints,layers:digest.layers}};
}
export function mergeWorldContext(base:MarketContext,world:MarketContext,targets:NewsTarget[]):MarketContext {
  const items=[...base.items];
  for(const item of world.items) {
    const index=items.findIndex(i=>i.url===item.url);
    if(index<0)items.push(item);
    else items[index]={...items[index],entityIds:[...new Set([...items[index].entityIds,...item.entityIds])],geo:items[index].geo||item.geo,provider:[...new Set([items[index].provider,item.provider])].join(' · ')};
  }
  return enrichRelevance({...base,items,providers:[...new Set([...base.providers,...world.providers])],world:world.world},targets);
}
export function entityCountries(a:Analysis):Map<string,string[]> {
  const result=new Map<string,string[]>();
  const put=(id:string,name?:string)=>{if(name)result.set(id,[...new Set([...(result.get(id)||[]),countryKey(name)])]);};
  for(const h of a.holdings) {
    // A fund's domicile is not the location of its investments.
    if(h.instrumentType!=='Investment fund')put(instrumentId(h.isin,h.id),h.country);
    for(const [i,c] of (h.fundHoldings?.holdings||[]).entries())put(instrumentId(c.isin,`underlying:${h.isin||h.id}:${i}`),c.country);
  }
  for(const e of portfolioExposures(a,'country'))put(e.id,e.name);
  return result;
}
export function itemCountries(item:ContextItem,countries:Map<string,string[]>):string[] {
  return [...new Set(item.entityIds.flatMap(id=>countries.get(id)||[]))];
}
export function scenarioEffect(weight:number|null,move:number):number|null {
  return weight!=null && Number.isFinite(weight) && weight>=0 && weight<=1 && Number.isFinite(move) && move>=-1?weight*move:null;
}
