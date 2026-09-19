import type { Analysis } from './types';
import { instrumentId, type ContextItem, type MarketContext, type NewsTarget } from './briefing';
import { portfolioExposures } from './portfolio';
import { enrichRelevance } from './research';
import { materialEvent, compareNews } from './events';
import { matchesNewsTarget } from './newsMatching';
export { countryKey } from './newsMatching';
import { countryKey } from './newsMatching';

export interface WorldArticle { id:string; title:string; source:string; url:string; publishedAt:string; summary?:string; tickers:string[]; portfolioMatch?:'none'; location?:[number,number]; locationName?:string; layer?:'news'|'shipping'|'disaster' }
export interface WorldQuote { symbol:string; name:string; price:number; change:number|null; asOf?:string; currency?:string; unit?:string; changeBasis?:string; source:string; url:string; sparkline:number[] }
export interface WorldChokepoint { id:string; name:string; coordinates:[number,number]; routes:string[]; status:'reference'|'reported'; detail:string; asOf?:string; url:string }
export interface WorldLayerStatus { id:string; label:string; state:'available'|'partial'|'stale'|'unavailable'; count:number; message:string; sourceUrl:string }
export interface WorldDigest { articles:WorldArticle[]; signals?:WorldArticle[]; quotes?:WorldQuote[]; chokepoints?:WorldChokepoint[]; layers?:WorldLayerStatus[]; state:'complete'|'partial'|'stale'|'unavailable'|'unconfigured'; generatedAt?:string; retrievedAt:string; message:string }
export interface WorldStatus { state:WorldDigest['state']; generatedAt?:string; retrievedAt:string; articles:number; matched:number; message:string; globalItems?:ContextItem[]; quotes?:WorldQuote[]; chokepoints?:WorldChokepoint[]; layers?:WorldLayerStatus[] }
export function matchesWorldArticle(article:WorldArticle,target:NewsTarget):boolean {
  return matchesNewsTarget(article,target);
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
  return enrichRelevance({...base,items:[...base.items,...world.items],providers:[...new Set([...base.providers,...world.providers])],world:world.world},targets);
}
export function worldViewItems(context:MarketContext|undefined,targets:NewsTarget[],days:number,now=Date.now()):ContextItem[] {
  if(!context)return [];
  const items=[...context.items,...context.world?.globalItems||[]].filter(i=>i.kind==='news'&&!i.sample&&Number.isFinite(Date.parse(i.publishedAt))&&Date.parse(i.publishedAt)<=now&&Date.parse(i.publishedAt)>=now-days*86400000);
  return enrichRelevance({...context,items},targets).items.sort(compareNews);
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
