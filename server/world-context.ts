import { createHash } from 'node:crypto';
import type { WorldArticle, WorldDigest } from '../src/lib/world';
import type { ProviderConfig } from './providers';

export function parseWorldDigest(raw:unknown,now=Date.now()):WorldDigest {
  if(!raw || typeof raw!=='object' || !('categories' in raw) || !raw.categories || typeof raw.categories!=='object' || Array.isArray(raw.categories))throw new Error('Invalid digest');
  const data=raw as Record<string,any>,seen=new Set<string>(),articles:WorldArticle[]=[];
  for(const bucket of Object.values(data.categories) as any[])for(const item of Array.isArray(bucket?.items)?bucket.items.slice(0,100):[]) {
    if(typeof item?.title!=='string'||!item.title.trim()||typeof item.source!=='string'||!item.source.trim())continue;
    if(/^(oops|access denied|page not found)\b|\bstock price\s*\||\bstock quote\b/i.test(item.title))continue;
    let url:URL;try{url=new URL(item.link);}catch{continue;}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||seen.has(url.href))continue;
    const published=Number(item.publishedAt??item.published_at);
    if(!Number.isFinite(published)||published<=0||published>now||published<now-365*86400000)continue;
    seen.add(url.href);
    const loc=item.location,longitude=loc?.longitude,latitude=loc?.latitude;
    const location: [number,number]|undefined=Number.isFinite(longitude)&&Number.isFinite(latitude)&&Math.abs(longitude)<=180&&Math.abs(latitude)<=90?[longitude,latitude]:undefined;
    articles.push({id:`world:${createHash('sha256').update(url.href).digest('hex').slice(0,16)}`,title:item.title.slice(0,500),source:item.source.slice(0,120),url:url.href,publishedAt:new Date(published).toISOString(),summary:typeof item.snippet==='string'?item.snippet.slice(0,600):undefined,tickers:Array.isArray(item.tickers)?item.tickers.filter((t:unknown)=>typeof t==='string'&&/^[A-Z0-9.^=-]{1,16}$/.test(t)).slice(0,8):[],location,locationName:typeof (item.locationName??item.location_name)==='string'?(item.locationName??item.location_name).slice(0,100):undefined});
  }
  const state:WorldDigest['state']=!articles.length?'unavailable':['complete','partial','stale'].includes(data.coverage?.state)?data.coverage.state:'partial';
  const generated=data.generatedAt??data.generated_at;
  return {articles:articles.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,500),state,generatedAt:typeof generated==='string'&&Number.isFinite(Date.parse(generated))?generated:undefined,retrievedAt:new Date(now).toISOString(),message:state==='stale'?'World Monitor is serving an older cached digest.':state==='complete'?'World Monitor RSS digest connected.':state==='partial'?'World Monitor connected; some source feeds are incomplete.':'World Monitor responded without usable dated articles.'};
}
export function createWorldResolver(config:ProviderConfig,request:typeof fetch=fetch) {
  let cached:WorldDigest|undefined,at=0,pending:Promise<WorldDigest>|undefined;
  return async ():Promise<WorldDigest>=>{
    const empty=(state:'unavailable'|'unconfigured',message:string):WorldDigest=>({state,message,articles:[],retrievedAt:new Date().toISOString()});
    if(!config.WORLDMONITOR_BASE_URL)return empty('unconfigured','World Monitor is not configured. Portfolio news remains available.');
    if(cached&&Date.now()-at<(cached.state==='unavailable'?30000:300000))return cached;
    if(pending)return pending;
    pending=(async()=>{
      try {
        const url=new URL('/api/news/v1/list-feed-digest?variant=full&lang=en',config.WORLDMONITOR_BASE_URL);
        const response=await request(url,{headers:config.WORLDMONITOR_API_KEY?{'X-WorldMonitor-Key':config.WORLDMONITOR_API_KEY}:{},signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw new Error('Digest unavailable');
        cached=parseWorldDigest(await response.json());
      }catch{cached=empty('unavailable','World Monitor could not be reached or its digest was unavailable. Portfolio news remains available.');}
      at=Date.now();return cached;
    })();
    try{return await pending;}finally{pending=undefined;}
  };
}
