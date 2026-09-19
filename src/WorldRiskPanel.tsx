import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Analysis } from './lib/types';
import { portfolioExposures } from './lib/portfolio';
import { countryKey, type WorldCiiDigest, type WorldCiiScore } from './lib/world';
import { percent } from './lib/format';

const regionNames=new Intl.DisplayNames(['en'],{type:'region'});
const names:Record<string,string>={TR:'Turkey',KP:'North Korea',KR:'South Korea',RU:'Russia'};
const countryName=(code:string)=>names[code]||regionNames.of(code)||code;
const band=(score:number)=>score>=81?'Critical':score>=66?'High':score>=51?'Elevated':score>=31?'Normal':'Low';
const observed=(date:string)=>new Date(date).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'});

export function WorldRiskPanel({analysis}:{analysis:Analysis}) {
  const [digest,setDigest]=useState<WorldCiiDigest>(),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0),[scope,setScope]=useState<'all'|'portfolio'>('all');
  const exposures=useMemo(()=>portfolioExposures(analysis,'country'),[analysis]);
  useEffect(()=>{
    const abort=new AbortController();setLoading(true);
    fetch('/api/world-risk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh:refresh>0}),signal:abort.signal})
      .then(async response=>{if(!response.ok)throw new Error();return await response.json() as WorldCiiDigest;})
      .then(result=>{if(!abort.signal.aborted)setDigest(result);})
      .catch(()=>{if(!abort.signal.aborted)setDigest({state:'unavailable',scores:[],retrievedAt:new Date().toISOString(),message:'Country instability scores could not be loaded.',sourceUrl:'https://www.worldmonitor.app/docs/methodology/cii-risk-scores'});})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[refresh]);
  const scores=digest?.scores||[];
  const byCountry=new Map(scores.map(score=>[countryKey(countryName(score.code)),score]));
  const byExposure=new Map(exposures.map(exposure=>[countryKey(exposure.name),exposure]));
  const rows:{name:string;score?:WorldCiiScore;exposure?:typeof exposures[number]}[]=scope==='all'
    ?scores.map(score=>({name:countryName(score.code),score,exposure:byExposure.get(countryKey(countryName(score.code)))}))
    :exposures.map(exposure=>({name:exposure.name,score:byCountry.get(countryKey(exposure.name)),exposure})).sort((a,b)=>(b.exposure?.weight||0)-(a.exposure?.weight||0));
  const hasDynamic=scores.some(score=>Object.values(score.components).some(value=>value>0));
  const asOf=scores.map(score=>score.computedAt).sort().at(-1),version=[...new Set(scores.map(score=>score.methodologyVersion))].join(', ');
  return <section className="world-risk" aria-label="Country instability index">
    <header className="world-risk-heading"><div><span className="ws-kicker">COUNTRY INSTABILITY INDEX</span><h3>Country stress, with source coverage</h3><p>World Monitor’s CII is a country-level screening score for 31 selected countries. It is not a company location, portfolio return, or measured impact on a holding.</p></div><button className="ws-icon" aria-label="Refresh country instability scores" disabled={loading} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={16}/></button></header>
    <div className={`world-risk-status world-risk-status--${digest?.state||'loading'}`} role="status"><strong>{loading&&!digest?'Loading CII scores…':digest?.state==='available'?'CII scores available':digest?.state==='partial'?'Limited CII signal coverage':digest?.state==='stale'?'CII snapshot stale':'CII unavailable'}</strong><span>{digest?.message||'Checking the local World Monitor service.'}</span>{asOf&&<small>Latest score observation {observed(asOf)} UTC · methodology {version}</small>}</div>
    <div className="world-risk-controls"><div className="world-risk-scope" aria-label="CII country scope"><button aria-pressed={scope==='all'} onClick={()=>setScope('all')}>All tracked <b>{scores.length}</b></button><button aria-pressed={scope==='portfolio'} onClick={()=>setScope('portfolio')}>Portfolio countries <b>{exposures.length}</b></button></div><a href={digest?.sourceUrl||'https://www.worldmonitor.app/docs/methodology/cii-risk-scores'} target="_blank" rel="noreferrer">Methodology ↗</a></div>
    {rows.length?<div className="world-risk-table-wrap"><table className="world-risk-table"><thead><tr><th scope="col">Country</th><th scope="col">Published CII</th><th scope="col">24h movement</th><th scope="col">Covered country classification</th><th scope="col">Observed</th></tr></thead><tbody>{rows.map(row=><tr key={row.score?.code||row.name}><th scope="row"><strong>{row.name}</strong>{row.score&&<details><summary>Components</summary><span>Unrest {row.score.components.unrest} · Conflict {row.score.components.conflict} · Security {row.score.components.security} · Information {row.score.components.information}</span></details>}</th><td>{row.score?<><b className={`world-risk-score world-risk-score--${band(row.score.score).toLowerCase()}`}>{row.score.score}/100</b><small>{band(row.score.score)}</small></>:<span className="world-risk-unavailable">Not tracked</span>}</td><td>{row.score&&hasDynamic?<span className={row.score.change24h>0?'world-risk-rising':row.score.change24h<0?'world-risk-falling':''}>{row.score.change24h>0?'+':''}{row.score.change24h}</span>:'—'}</td><td>{row.exposure?percent(row.exposure.weight,2):'—'}</td><td>{row.score?`${observed(row.score.computedAt)} UTC`:'—'}</td></tr>)}</tbody></table></div>:<p className="world-risk-empty">{loading?'Loading countries…':scope==='portfolio'?'No classified country exposure is available for this portfolio scope.':'No dated CII scores are available from the local service.'}</p>}
    <p className="world-risk-note">Country classifications are sourced from the supplied portfolio records and may cover only part of fund holdings. CII tracks 31 selected countries, so “Not tracked” does not mean low risk. A zero 24h movement may also mean no valid prior snapshot. Scores are context for adviser review, not a portfolio risk calculation.</p>
  </section>;
}
