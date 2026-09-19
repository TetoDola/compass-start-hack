import type { Evidence, Finding, Row } from './types';
import { dateLabel, list, money, percent } from './format';
import type { PdfContribution, PdfPerformance } from './pdfImport';
export function pdfEvidence(portfolio:Row,page:number,id:string,title:string,fields:Evidence['fields'],note?:string):Evidence {
  return {id,title,type:'record',date:portfolio.FactoryDateUtc,location:`${portfolio.ExternalSource.fileName} · page ${page}`,document:{hash:portfolio.ExternalSource.hash,page},fields,note:note||'Reported external custody snapshot. Values are taken from the statement and have not been repriced.'};
}
export function reportedFinding(p:Row):Finding|undefined {
  const perf=p.ReportedPerformance as PdfPerformance|undefined;if(!p.ExternalSource||!perf)return;
  const contributions=list<PdfContribution>(p.ReportedContributions), currency=p.PortfolioCurrency;
  const text=[`Reported net TWR ${percent(perf.twr,2)} · ${dateLabel(perf.start,true)}–${dateLabel(perf.end,true)}.`,
    ...(perf.profit!=null&&perf.netFlows!=null?[`Investment profit ${money(perf.profit,currency)}; net flows ${money(perf.netFlows,currency)}.`]:[])];
  const top=[...contributions].sort((a,b)=>b.profit-a.profit)[0];
  if(top)text.push(`${top.assetClass} contributed ${money(top.profit,currency)}${top.profitShare!=null?` (${percent(top.profitShare,2)} of monetary profit)`:''}.`);
  const losses=contributions.filter(c=>c.profit<0);for(const c of losses)text.push(`${c.assetClass} lost ${money(Math.abs(c.profit),currency)} during the reporting period.`);
  const source=pdfEvidence(p,perf.page,`reported-performance-${p.PortfolioId}`,'Reported statement performance',[
    {label:'Reporting period',value:`${perf.start} to ${perf.end}`},{label:'Net time-weighted return',value:percent(perf.twr,2)},
    ...Object.entries({'Opening value':perf.opening,'Closing value':perf.closing,'Net flows':perf.netFlows,'Investment profit':perf.profit}).filter(([,v])=>v!=null).map(([label,v])=>({label,value:money(v!,currency)}))], 'Statement-reported return, not a live rolling return. Net flows are separate from investment profit.');
  const detail=contributions.length?[pdfEvidence(p,contributions[0].page,`reported-contributions-${p.PortfolioId}`,'Reported asset-class contributions',contributions.map(c=>({label:c.assetClass,value:`${money(c.profit,currency)} profit${c.mwr!=null?`; ${percent(c.mwr,2)} MWR`:''}${c.profitShare!=null?`; ${percent(c.profitShare,2)} share of profit`:''}`})), 'Asset-class MWR and share of monetary profit are different measures from portfolio TWR. No individual-security or news attribution is supplied.')]:[];
  return {id:`reported-performance-${p.PortfolioId}`,section:'happened',kind:losses.length?'attention':'context',tag:'Reported performance',title:`${p.PortfolioNr} · ${percent(perf.twr,2)} reported return`,body:text.join('\n'),question:'Review the reported contributors and losses, then confirm current positions and client objectives before proposing changes.',evidence:[source,...detail],entities:[{id:'customer',label:p.ExternalSource.owner,type:'client'},{id:`p-${p.PortfolioId}`,label:p.PortfolioNr,type:'portfolio',evidenceId:source.id}],connections:[{from:'customer',to:`p-${p.PortfolioId}`,label:'external custody'}]};
}
