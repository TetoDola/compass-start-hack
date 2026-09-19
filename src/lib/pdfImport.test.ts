import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseCustodyPages, attachCustodyReport, identityIssue, pdfRows, type PdfPage, type CustodyReport } from './pdfImport';
import { analyze } from './analysis';
import { advisorFacts, routeQuestion } from './advisor';
import { briefingCandidates, defaultSelection, validateSelection } from './briefing';
import type { Dataset } from './types';
const empty:Dataset={version:'case',clients:[],reference:{Securities:[],RiskProfiles:[],StrategicAssetAllocations:[],FundBreakdowns:[]}};
async function extract(file:string) {
  const task=getDocument({data:new Uint8Array(await readFile(new URL(`../../unriskomega-2026/side-challenge/${file}`,import.meta.url))),useSystemFonts:true});
  try{const doc=await task.promise,pages:PdfPage[]=[];for(let i=1;i<=doc.numPages;i++)pages.push({page:i,items:(await(await doc.getPage(i)).getTextContent()).items.filter((i):i is typeof i & {str:string;transform:number[]}=>'str' in i)});return pages;}finally{await task.destroy();}
}
let max:CustodyReport;
const fixtures=(async()=>{const files=(await readdir(new URL('../../unriskomega-2026/side-challenge/',import.meta.url))).filter(s=>s.endsWith('.pdf')).sort();return Promise.all(files.map(async file=>{const pages=await extract(file);return {pages,report:parseCustodyPages(pages,file,file)};}));})();
test('all ten actual PDFs reconcile, retain every position and extract annual performance',async()=>{
  const reports=(await fixtures).map(f=>f.report);max=reports[0];
  assert.equal(reports.length,10);assert.equal(reports.reduce((n,r)=>n+r.positions.length,0),198);assert.equal(reports.reduce((n,r)=>n+r.cash.length,0),24);
  for(const r of reports){assert.ok(Math.abs(r.reconciliation)<=2);assert.equal(r.asOf,'2025-12-31');assert.equal(r.contributions.length,4);assert.ok(r.allocations.some(a=>a.dimension==='industry'&&a.scope==='equities'));assert.ok(r.performance?.profit);}
  assert.equal(max.performance?.profit,101314);assert.equal(max.performance?.netFlows,83787);assert.equal(max.positions.find(p=>p.name.includes('NVIDIA'))?.value,69330);
});
test('continuation pages can grow beyond eight without dropping rows or their source pages',async()=>{
  const {pages,report}= (await fixtures)[0];const expanded:PdfPage[]=[];
  for(const page of pages){const rows=pdfRows(page.items);if(!rows.some(r=>r.text.startsWith('Detailpositionen'))){expanded.push(page);continue;}
    const body=rows.filter(r=>/^[A-Z]{3} [\d']|^(Liquidität \/ Geldmarkt|Obligationen|Aktien|Alternative Anlagen)$/.test(r.text));
    for(let start=0;start<body.length;start+=3){const text=[`Detailpositionen (Fortsetzung) per 31.12.2025, in CHF`,...body.slice(start,start+3).map(r=>r.text)];expanded.push({page:0,items:text.map((str,i)=>({str,transform:[1,0,0,1,40,700-i*20]}))});}
  }
  const result=parseCustodyPages(expanded.map((p,i)=>({...p,page:i+1})),'long.pdf','long');
  assert.ok(result.pages>8);assert.equal(result.positions.length,report.positions.length);assert.equal(result.cash.length,report.cash.length);assert.equal(result.reconciliation,0);assert.ok(result.positions.some(p=>p.page>8));
});
test('larger same-format report with more data imports all 40 positions over 11 pages',()=>{
  const make=(page:number,lines:string[]):PdfPage=>({page,items:lines.map((str,i)=>({str,transform:[1,0,0,1,40,700-i*20]}))});
  const pages=[make(1,['Example Bank','Kunde Herr Demo Owner','Portfolio Depot-Nr. 1234.56 · Mandat «Ausgewogen»','Referenzwährung CHF','Stichtag Bewertung 31.12.2025',"Vermögen per Stichtag CHF 400'000"])];
  for(let page=2;page<=11;page++)pages.push(make(page,['Detailpositionen (Fortsetzung) per 31.12.2025, in CHF',...(page===2?['Aktien']:[]),...Array.from({length:4},(_,i)=>`CHF 100 Akt Company ${page}-${i} 1234 / US0378331005 90.00 100.00 31.12.25 10'000 2.50 %`)]));
  const report=parseCustodyPages(pages,'more-data.pdf','more');assert.equal(report.pages,11);assert.equal(report.positions.length,40);assert.equal(report.reconciliation,0);
});
test('incomplete or malformed holding pages are rejected without mutating data',async()=>{
  const {pages}= (await fixtures)[0];assert.throws(()=>parseCustodyPages(pages.filter(p=>p.page!==7),'partial.pdf','partial'),/reconcile|incomplete/);
  const bad=structuredClone(pages);const item=bad.flatMap(p=>p.items).find(i=>i.str==='172.83');assert.ok(item);item.str='not a price';assert.throws(()=>parseCustodyPages(bad,'bad.pdf','bad'),/could not be read/);
  assert.throws(()=>parseCustodyPages([{page:1,items:[]}],'scan.pdf','scan'),/OCR/);
});
test('create, attach, duplicate detection and dated snapshot updates preserve existing clients',async()=>{
  const report=(await fixtures)[0].report;
  const first=attachCustodyReport(empty,report,'new');assert.equal(empty.clients.length,0);assert.equal(first.dataset.clients.length,1);
  const duplicate=attachCustodyReport(first.dataset,report,'new');assert.equal(duplicate.duplicate,true);assert.equal(duplicate.dataset,first.dataset);
  const later={...report,hash:'later',asOf:'2026-03-31'};
  const update=attachCustodyReport(first.dataset,later,first.clientId);assert.equal(update.dataset.clients[0].Portfolios.length,1);assert.equal(update.dataset.clients[0].Portfolios[0].PreviousSnapshots.length,1);assert.equal(update.portfolioId,first.portfolioId);
  assert.throws(()=>attachCustodyReport(update.dataset,{...report,hash:'older'},first.clientId),/date or later/);
  const other=attachCustodyReport(first.dataset,(await fixtures)[1].report,'new');assert.equal(other.dataset.clients.length,2);assert.deepEqual(other.dataset.clients[0],first.dataset.clients[0]);
  assert.throws(()=>attachCustodyReport(other.dataset,{...report,hash:'moved'},other.clientId),/another client/);
});
test('unreliable identifiers cannot poison references or merge conflicting instruments',async()=>{
  const report=(await fixtures)[0].report;
  const treasury={...report.positions[0],isin:'CH0559601544',name:'0.500% Schweiz. Eidgenossenschaft 2020-2032',currency:'CHF',assetClass:'Bonds'};
  const dataset={...empty,reference:{...empty.reference,Securities:[{Id:25672,Isin:'CH0559601544',Name:'Call-Opt. CieFinRichemont',SecurityTypeName:'Option',Currency:'CHF'}]}};
  assert.match(identityIssue(treasury,dataset)!,/differs/);
  const result=attachCustodyReport(dataset,{...report,positions:[treasury]},'new');const a=analyze(result.dataset,result.dataset.clients[0]);assert.equal(a.holdings[0].isin,undefined);assert.equal(a.holdings[0].instrumentType,'Bonds');assert.equal(dataset.reference.Securities[0].SecurityTypeName,'Option');
  const imported=attachCustodyReport(empty,report,'new');const analysis=analyze(imported.dataset,imported.dataset.clients[0]);
  assert.ok(analysis.holdings.filter(h=>!h.isin).length>0);assert.ok(analysis.holdings.every(h=>h.priceDate==='2025-12-31'));assert.ok(analysis.holdings.every(h=>h.evidence.document));
});
test('brief and chat use reported TWR and profit; mixed snapshot totals are withheld',async()=>{
  const report=(await fixtures)[0].report;const imported=attachCustodyReport(empty,report,'new');const customer=imported.dataset.clients[0];const a=analyze(imported.dataset,customer);
  assert.equal(a.aum,report.total);assert.equal(a.history.length,0);const facts=advisorFacts(a);assert.ok(facts.find(f=>f.id==='performance:reported')?.text.join(' ').includes('5.20%'));assert.ok(routeQuestion('Give me a brief',facts).includes('performance:reported'));
  const candidates=briefingCandidates(a),selection=defaultSelection(candidates);assert.ok(selection.development[0].includes('reported-performance'));validateSelection(selection,candidates);
  const combined={...customer,Portfolios:[...customer.Portfolios,{PortfolioId:999,PortfolioCurrency:'CHF',FactoryDateUtc:'2026-09-19',AssetsUnderManagementInDefaultCurrency:1000,SecurityPositions:[],AccountPositions:[]}]};
  assert.equal(analyze(imported.dataset,combined).aum,null);assert.equal(analyze(imported.dataset,combined).scopeAmbiguous,true);
  const foreign={...customer,ReportingCurrency:'USD'};assert.equal(analyze(imported.dataset,foreign,String(imported.portfolioId)).currency,'CHF');
});
