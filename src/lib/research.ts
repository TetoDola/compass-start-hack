import type { ContextItem, MarketContext, NewsTarget } from './briefing';
import { percent } from './format';

export interface ResearchView { title:string; source:string; url:string; publishedAt:string; summary:string; provenance:'public-research'|'bank-approved'; topics:{kind:'company'|'industry'|'country'|'region'; value:string}[] }
export function parseResearch(text:string):ResearchView[] {
  const rows=JSON.parse(text);
  if(!Array.isArray(rows)||!rows.length||rows.length>50)throw new Error('Upload an array of 1–50 research views.');
  return rows.map(row=>{
    if(!row || ['title','source','summary'].some(k=>typeof row[k]!=='string'||!row[k].trim()||row[k].length>1500))throw new Error('Each view needs a title, source and summary.');
    let url:URL;try{url=new URL(row.url);}catch{throw new Error('Each view needs its original source URL.');}
    if(!['https:','http:'].includes(url.protocol))throw new Error('Research links must use HTTP or HTTPS.');
    if(typeof row.publishedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.publishedAt)||!Number.isFinite(Date.parse(row.publishedAt))||new Date(row.publishedAt).toISOString().slice(0,10)!==row.publishedAt||Date.parse(row.publishedAt)>Date.now())throw new Error('Supply a valid publication date (YYYY-MM-DD), no later than today.');
    if(!['public-research','bank-approved'].includes(row.provenance))throw new Error('Declare public-research or bank-approved provenance.');
    if(!Array.isArray(row.topics)||!row.topics.length||row.topics.length>30||row.topics.some((t:any)=>!t||!['company','industry','country','region'].includes(t.kind)||typeof t.value!=='string'||!t.value.trim()||t.value.length>150||(t.kind==='company'&&!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(t.value))))throw new Error('Use company ISINs or exact industry, country or region labels as topics.');
    return {title:row.title,source:row.source,url:url.href,publishedAt:row.publishedAt,summary:row.summary,provenance:row.provenance,topics:row.topics};
  });
}
export function researchItems(views:ResearchView[],targets:NewsTarget[]):ContextItem[] {
  return views.flatMap((view,i)=>{
    const linked=targets.filter(t=>view.topics.some(topic=>topic.kind===(t.kind||'company') && (topic.kind==='company'?t.isin===topic.value:t.name.toLowerCase()===topic.value.toLowerCase())));
    if(!linked.length)return [];
    return [{id:`house:${i}:${view.publishedAt}`,kind:'house-view',title:view.title,source:view.source,url:view.url,publishedAt:view.publishedAt,retrievedAt:new Date().toISOString(),entityIds:linked.map(t=>t.id),summary:view.summary,provenance:view.provenance,provider:'Uploaded research library',relevance:`Matched to ${linked.map(t=>t.name).join(', ')}. ${Math.floor((Date.now()-Date.parse(view.publishedAt))/86400000)} days since publication. ${view.provenance==='bank-approved'?'Bank approval declared by uploader; verify validity.':'Public research, not a bank-approved recommendation.'}`}];
  });
}
// Google RSS and direct publisher feeds can carry different URLs for the same
// headline. Merge only news with the same full normalized title and UTC date;
// independent sensor observations and house views retain their own identity.
export function mergeContextItems(items:ContextItem[]):ContextItem[] {
  const result:ContextItem[]=[], keys=new Map<string,number>();
  for(const item of items) {
    const title=item.title.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    const news=item.kind==='news'&&(!item.layer||item.layer==='news');
    const aliases=news?[`news:url:${item.url}`, ...(title.length>=20?[`news:title:${item.publishedAt.slice(0,10)}:${title}`]:[])]:[`${item.kind}:${item.layer||'research'}:id:${item.id}`];
    const index=aliases.map(k=>keys.get(k)).find(i=>i!=null);
    if(index==null) {for(const k of aliases)keys.set(k,result.length);result.push({...item,entityIds:[...new Set(item.entityIds)]});continue;}
    const old=result[index];
    const preferPublisher=old.url.startsWith('https://news.google.com/')&&!item.url.startsWith('https://news.google.com/');
    result[index]={...old,...(preferPublisher?{url:item.url,source:item.source}:{}),summary:old.summary||item.summary,imageUrl:old.imageUrl||item.imageUrl,geo:old.geo||item.geo,entityIds:[...new Set([...old.entityIds,...item.entityIds])],provider:[...new Set([...old.provider.split(' · '),...item.provider.split(' · ')])].join(' · ')};
    for(const k of aliases)keys.set(k,index);
  }
  return result;
}
export function enrichRelevance(context:MarketContext,targets:NewsTarget[]):MarketContext {
  return {...context,items:mergeContextItems(context.items).map(item=>{
    const linked=targets.filter(t=>item.entityIds.includes(t.id));
    const companies=linked.filter(t=>!t.kind||t.kind==='company');
    const validWeight=(t:NewsTarget)=>t.weight!=null&&Number.isFinite(t.weight)&&t.weight>=0&&t.weight<=1;
    const rawWeight=companies.length?(companies.every(validWeight)?companies.reduce((n,t)=>n+t.weight!,0):null):linked.length && linked.every(validWeight)?Math.max(...linked.map(t=>t.weight!)):null;
    const weight=rawWeight!=null&&rawWeight<=1?rawWeight:null;
    const sourceRelevance=item.kind==='house-view'?(item.sourceRelevance ?? item.relevance):companies.length?'Company name or verified symbol matched in the source. Financial impact is unverified.':'Country, region or sector context only; operating and supply-chain exposure are not established.';
    return {...item,entityIds:linked.map(t=>t.id),sourceRelevance,matchKind:companies.length?'company' as const:linked.length?'topic' as const:undefined,exposureWeight:weight,relevance:linked.length?`${linked.map(t=>`${t.name}: ${validWeight(t)?percent(t.weight!,2):'weight unavailable'} ${t.kind||'company'} exposure via ${t.via}`).join('; ')}. ${sourceRelevance}`:'Global context; no supported match in the selected portfolio.'};
  })};
}
