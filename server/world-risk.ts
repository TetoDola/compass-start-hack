import type { WorldCiiDigest, WorldCiiScore } from '../src/lib/world';
import type { ProviderConfig } from './providers';

const sourceUrl='https://www.worldmonitor.app/docs/methodology/cii-risk-scores';
const empty=(state:'unavailable'|'unconfigured',message:string):WorldCiiDigest=>({state,scores:[],retrievedAt:new Date().toISOString(),message,sourceUrl});
const score=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;

export function parseCiiScores(raw:unknown,now=Date.now()):WorldCiiDigest {
  if(!raw||typeof raw!=='object'||!Array.isArray((raw as {ciiScores?:unknown}).ciiScores))return empty('unavailable','World Monitor returned no CII scores.');
  const data=raw as {ciiScores:unknown[];degraded?:boolean;stale?:boolean};
  const scores:WorldCiiScore[]=[];
  const seen=new Set<string>();
  for(const value of data.ciiScores) {
    if(!value||typeof value!=='object')continue;
    const row=value as Record<string,any>,code=row.region,components=row.components;
    if(typeof code!=='string'||!/^[A-Z]{2}$/.test(code)||seen.has(code)||!score(row.combinedScore)||typeof row.dynamicScore!=='number'||!Number.isFinite(row.dynamicScore)||Math.abs(row.dynamicScore)>100||!Number.isFinite(row.computedAt)||row.computedAt<Date.UTC(2000,0,1)||row.computedAt>now+300000||typeof row.methodologyVersion!=='string'||!row.methodologyVersion||row.methodologyVersion.length>30||!components||!['ciiContribution','geoConvergence','militaryActivity','newsActivity'].every(key=>score(components[key])))continue;
    seen.add(code);
    scores.push({code,score:row.combinedScore,change24h:row.dynamicScore,trend:row.trend==='TREND_DIRECTION_RISING'?'rising':row.trend==='TREND_DIRECTION_FALLING'?'falling':'stable',components:{unrest:components.ciiContribution,conflict:components.geoConvergence,security:components.militaryActivity,information:components.newsActivity},computedAt:new Date(row.computedAt).toISOString(),methodologyVersion:row.methodologyVersion});
  }
  if(!scores.length)return empty('unavailable','World Monitor returned no valid dated CII scores.');
  scores.sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
  const dynamic=scores.some(row=>Object.values(row.components).some(value=>value>0));
  const old=scores.every(row=>now-Date.parse(row.computedAt)>30*60000);
  const state:WorldCiiDigest['state']=data.stale||old?'stale':data.degraded||!dynamic||scores.length<31?'partial':'available';
  const message=old||data.stale?'This CII snapshot is stale. Check its source time before using the scores.':!dynamic?'No dynamic CII components were reported. Scores may reflect baseline, advisory and other inputs; they do not establish current calm.':data.degraded?'World Monitor reports degraded CII inputs.':scores.length<31?'Only part of the tracked CII country set was returned.':'Country instability scores are available.';
  return {state,scores,retrievedAt:new Date(now).toISOString(),message,sourceUrl};
}

export function createCiiResolver(config:ProviderConfig,request:typeof fetch=fetch) {
  let cached:WorldCiiDigest|undefined,at=0,pending:Promise<WorldCiiDigest>|undefined;
  return async (refresh=false):Promise<WorldCiiDigest>=>{
    if(!config.WORLDMONITOR_BASE_URL||!config.WORLDMONITOR_API_KEY)return empty('unconfigured','Country instability scores require the local World Monitor service and its API key.');
    if(!refresh&&cached&&Date.now()-at<300000)return cached;
    if(pending)return pending;
    pending=(async()=>{
      try {
        const url=new URL('/api/intelligence/v1/get-risk-scores',config.WORLDMONITOR_BASE_URL);
        const response=await request(url,{headers:{'X-WorldMonitor-Key':config.WORLDMONITOR_API_KEY!},signal:AbortSignal.timeout(28000)});
        if(!response.ok)throw new Error('CII unavailable');
        cached=parseCiiScores(await response.json());at=Date.now();return cached;
      }catch {
        if(cached?.scores.length)return {...cached,state:'stale',message:'CII refresh failed. Showing the last retrieved snapshot and its original observation times.'};
        return empty('unavailable','Country instability scores could not be loaded from the local World Monitor service.');
      }
    })();
    try{return await pending;}finally{pending=undefined;}
  };
}
