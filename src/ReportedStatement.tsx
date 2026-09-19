import type { Analysis, Evidence } from './lib/types';
import type { PdfAllocation } from './lib/pdfImport';
import { list, percent } from './lib/format';
import { pdfEvidence } from './lib/reported';
export function ReportedStatement({analysis,onEvidence}:{analysis:Analysis;onEvidence:(e:Evidence)=>void}) {
  return <>{analysis.portfolios.filter(p=>p.ExternalSource).map(p=>{
    const finding=analysis.findings.find(f=>f.id===`reported-performance-${p.PortfolioId}`), allocations=list<PdfAllocation>(p.ReportedAllocations);
    return <section className="pdf-reported-performance" key={p.PortfolioId} aria-label="Imported statement briefing">
      <span className="ws-kicker">External custody · {p.ExternalSource.bank}</span>
      <h3>{finding?.title||p.PortfolioNr}</h3>
      {finding&&<ul>{finding.body.split('\n').map((point,i)=><li key={i}>{point}</li>)}</ul>}
      <button className="ws-link" onClick={()=>onEvidence(finding?.evidence[0]||analysis.evidence.find(e=>e.id===`p-${p.PortfolioId}`)!)}>View original statement</button>
      {finding?.evidence[1]&&<button className="ws-link" style={{marginLeft:20}} onClick={()=>onEvidence(finding.evidence[1])}>Inspect profit contributions</button>}
      <details style={{marginTop:16}}><summary>Statement exposures & data checks</summary>
        {(['asset','currency','region','industry'] as const).map(d=>{
          const rows=allocations.filter(r=>r.dimension===d);if(!rows.length)return null;
          return <div key={d} style={{marginTop:14}}><strong>{d==='asset'?'Asset classes':d==='currency'?'Currencies':d==='region'?'Equity regions':'Equity sectors'} · {rows[0].scope==='equities'?'% of equities':'% of portfolio'}</strong><p>{rows.map(r=>`${r.label}: ${percent(r.weight,2)}`).join(' · ')}</p><button className="ws-link" onClick={()=>onEvidence(pdfEvidence(p,rows[0].page,`reported-allocation-${p.PortfolioId}-${d}`,'Reported allocation',rows.map(r=>({label:r.label,value:percent(r.weight,2)})),`Scope: ${rows[0].scope}. Aggregate statement breakdown, not individual-company classification.`))}>Source</button></div>;
        })}
        <ul>{p.ExternalSource.warnings.map((s:string,i:number)=><li key={i}>{s}</li>)}</ul>
        <p className="microcopy">{p.SecurityPositions.filter((s:any)=>s.IdentityIssue).length} holdings retained with unresolved identifiers. {list(p.PreviousSnapshots).length} earlier snapshots saved. Historical external assets are not managed AUM.</p>
      </details>
    </section>;
  })}</>;
}
