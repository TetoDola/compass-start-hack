import { useMemo, useState } from 'react';
import { WorkspaceDialog } from './WorkspaceDialog';
import type { Dataset } from './lib/types';
import { clientName, dateLabel, money, percent } from './lib/format';
import { identityIssue, type CustodyReport } from './lib/pdfImport';
export function PdfImportDialog({report,dataset,currentClientId,busy,error,onClose,onImport}:{report:CustodyReport;dataset:Dataset;currentClientId:number|null;busy:boolean;error:string;onClose:()=>void;onImport:(target:number|'new')=>void}) {
  const [target,setTarget]=useState('new'),[confirmed,setConfirmed]=useState(false);
  const problems=useMemo(()=>report.positions.map(p=>({name:p.name,issue:identityIssue(p,dataset)})).filter(p=>p.issue),[report,dataset]);
  const client=dataset.clients.find(c=>String(c.ClientId)===target);
  return <WorkspaceDialog open title="Import client data" onClose={()=>{if(!busy)onClose();}} wide>
    <div className="pdf-import">
      <p className="pdf-import-intro">Add this statement as an external portfolio. Existing client records are preserved.</p>
      <div className="pdf-import-summary"><div><span>Statement owner</span><strong>{report.owner}</strong><small>{report.bank} · {report.strategy}</small></div><div><span>Reported assets</span><strong>{money(report.total,report.currency)}</strong><small>As of {dateLabel(report.asOf,true)}</small></div><div><span>Extracted from {report.pages} pages</span><strong>{report.positions.length} holdings</strong><small>{report.cash.length} cash balances · {((report.elapsedMs||0)/1000).toFixed(1)}s to read</small></div></div>
      <label className="pdf-import-target">Import into<select value={target} disabled={busy} onChange={e=>{setTarget(e.target.value);setConfirmed(false);}}><option value="new">Create client: {report.owner.replace(/^(Herr|Frau) /,'')}</option>{dataset.clients.map(c=><option key={c.ClientId} value={c.ClientId}>{clientName(c)}{c.ClientId===currentClientId?' (current client)':''}</option>)}</select></label>
      {client&&<label className="pdf-import-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this statement belongs to {clientName(client)}. Detected owner: {report.owner}.</label>}
      <div className="pdf-import-check"><strong>Totals reconciled</strong><span>Difference: {money(report.reconciliation,report.currency)} from printed rounding.</span></div>
      {report.performance&&<p>Reported net TWR: <strong>{percent(report.performance.twr,2)}</strong> · {dateLabel(report.performance.start,true)}–{dateLabel(report.performance.end,true)}. This is a historical reporting period.</p>}
      <details><summary>Review extracted holdings ({report.positions.length})</summary><div className="pdf-import-table"><table><thead><tr><th>Holding</th><th>Value ({report.currency})</th><th>Weight</th><th>Page</th></tr></thead><tbody>{report.positions.map((p,i)=><tr key={i}><td>{p.name}<small>{p.isin}</small></td><td>{money(p.value,report.currency)}</td><td>{percent(p.weight,2)}</td><td>{p.page}</td></tr>)}</tbody></table></div></details>
      {problems.length>0&&<details><summary>{problems.length} holdings have identifier warnings</summary><p>Values are retained. These identifiers will not be used for automatic security matching.</p><ul>{problems.map((p,i)=><li key={i}>{p.name}: {p.issue}</li>)}</ul></details>}
      <p className="microcopy">Stored in this browser with the original PDF. Historical snapshots stay separate from current managed assets. Extra pages in this reporting format are read automatically.</p>
      {error&&<p role="alert" className="pdf-import-error">{error}</p>}
      <div className="pdf-import-actions"><button className="ws-button" disabled={busy} onClick={onClose}>Cancel</button><button className="ws-button ws-button--primary" disabled={busy||(target!=='new'&&!confirmed)} onClick={()=>onImport(target==='new'?'new':Number(target))}>{busy?'Saving…':target==='new'?'Create client & import':'Add external portfolio'}</button></div>
    </div>
  </WorkspaceDialog>;
}
