import type { Dataset, Row } from './types';
import { list } from './format';

export interface PdfTextItem { str: string; transform: number[] }
export interface PdfPage { page: number; items: PdfTextItem[] }
export interface PdfRow { text: string; y: number; items: { text: string; x: number }[] }
export interface PdfPosition { name: string; currency: string; quantity: number; value: number; weight: number; page: number; assetClass: string; isin?: string; price?: number; cost?: number; priceDate: string }
export interface PdfPerformance { start: string; end: string; twr: number; page: number; opening?: number; closing?: number; netFlows?: number; profit?: number }
export interface PdfContribution { assetClass: string; profit: number; mwr?: number; profitShare?: number; page: number }
export interface PdfAllocation { dimension: 'asset'|'currency'|'region'|'industry'; scope: 'portfolio'|'equities'; label: string; weight: number; page: number }
export interface CustodyReport {
  fileName: string; hash: string; pages: number; owner: string; bank: string; account: string; strategy: string; currency: string; asOf: string; total: number;
  positions: PdfPosition[]; cash: PdfPosition[]; performance?: PdfPerformance; contributions: PdfContribution[]; allocations: PdfAllocation[];
  warnings: string[]; reconciliation: number; elapsedMs?: number;
}
const numeric = "[+-]?[\\d'’]+(?:\\.\\d+)?";
const amount = (s: string) => Number(s.replace(/['’\s]/g, ''));
function iso(s: string) {
  const [d,m,y] = s.split('.').map(Number), year = y < 100 ? 2000+y : y;
  const result = new Date(Date.UTC(year,m-1,d));
  if(result.getUTCFullYear()!==year || result.getUTCMonth()!==m-1 || result.getUTCDate()!==d)throw new Error(`Invalid report date: ${s}.`);
  return result.toISOString().slice(0,10);
}
export function pdfRows(items: PdfTextItem[]): PdfRow[] {
  const rows: PdfRow[] = [];
  for(const item of items) {
    if(!item.str.trim())continue;
    let row=rows.find(r=>Math.abs(r.y-item.transform[5])<2);
    if(!row){row={y:item.transform[5],text:'',items:[]};rows.push(row);}
    row.items.push({text:item.str,x:item.transform[4]});
  }
  return rows.sort((a,b)=>b.y-a.y).map(r=>({...r,items:r.items.sort((a,b)=>a.x-b.x),text:r.items.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim()}));
}
export function validIsin(s: string) {
  if(!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s))return false;
  const digits=[...s].map(c=>parseInt(c,36).toString()).join('').split('').reverse().map(Number);
  return digits.reduce((n,d,i)=>n+(i%2 ? Math.floor(d*2/10)+d*2%10 : d),0)%10===0;
}
const classes: Record<string,string> = {'Liquidität / Geldmarkt':'Cash','Obligationen':'Bonds','Aktien':'Equities','Alternative Anlagen':'Alternatives'};
const securityRow = new RegExp(`^([A-Z]{3}) (${numeric}) (.+?) [\\d ]+ / ([A-Z]{2}[A-Z0-9]{9}\\d) (${numeric}) (${numeric}) (\\d{2}\\.\\d{2}\\.\\d{2,4}) (${numeric}) (${numeric}) %$`);
const cashRow = new RegExp(`^([A-Z]{3}) (${numeric}) (.*?) [A-Z]{2}\\d{2}[A-Z0-9 ]+? (?:${numeric} )?(\\d{2}\\.\\d{2}\\.\\d{2,4}) (${numeric}) (${numeric}) %$`);
const instrumentType = (p: PdfPosition) => /^(Ant|Anteile|Fonds)\b|\b(ETF|UCITS|Fund)\b/i.test(p.name) ? 'Investment fund' : p.assetClass==='Bonds' ? 'Bonds' : /^(N-Akt|I-Akt|Akt|N-PS|PS)\b/.test(p.name) ? 'Shares' : 'Unknown instrument';

/** Heading-driven parser: any number of pages, including continuation pages. Never uses page indexes as section identities. */
export function parseCustodyPages(pages: PdfPage[], fileName: string, hash: string): CustodyReport {
  const all=pages.map(p=>({...p,rows:pdfRows(p.items)}));
  const cover=all.find(p=>p.rows.some(r=>/^Stichtag Bewertung /.test(r.text)));
  if(!cover)throw new Error('No supported custody-statement cover found. Choose a text PDF in the supplied reporting format; scanned PDFs need OCR.');
  const text=cover.rows.map(r=>r.text).join('\n');
  const required=(pattern:RegExp,label:string)=>{const m=text.match(pattern);if(!m)throw new Error(`The report is missing ${label}. Nothing was imported.`);return m;};
  const owner=required(/^Kunde (.+)$/m,'the owner')[1], account=required(/Depot-Nr\. ([\d.]+)/,'the depot number')[1];
  const currency=required(/^Referenzwährung ([A-Z]{3})$/m,'the reporting currency')[1];
  const asOf=iso(required(/^Stichtag Bewertung (\d{2}\.\d{2}\.\d{4})$/m,'the valuation date')[1]);
  const total=amount(required(new RegExp(`^Vermögen per Stichtag ${currency} (${numeric})$`,'m'),'total assets')[1]);
  if(total<=0)throw new Error('A positive portfolio total is required for this import.');
  const report:CustodyReport={fileName,hash,pages:pages.length,owner,account,bank:cover.rows[0].text,strategy:text.match(/Mandat «([^»]+)»/)?.[1]||'Not supplied',currency,asOf,total,positions:[],cash:[],contributions:[],allocations:[],warnings:[],reconciliation:0};
  const interval=text.match(/Berichtsperiode vom (\d{2}\.\d{2}\.\d{4}) bis (\d{2}\.\d{2}\.\d{4})/), twr=text.match(new RegExp(`Performance \\d{4} \\(TWR, netto\\) (${numeric}) %`));
  if(interval&&twr)report.performance={start:iso(interval[1]),end:iso(interval[2]),twr:amount(twr[1])/100,page:cover.page};
  let category='', pending='', pendingPage=0;
  function flush() {
    if(!pending)return;
    const m=pending.match(securityRow), cash=pending.match(cashRow);
    let position:PdfPosition;
    if(m){position={currency:m[1],quantity:amount(m[2]),name:m[3],isin:m[4],cost:amount(m[5]),price:amount(m[6]),priceDate:iso(m[7]),value:amount(m[8]),weight:amount(m[9])/100,assetClass:category,page:pendingPage};}
    else if(cash&&category==='Cash'){position={currency:cash[1],quantity:amount(cash[2]),name:cash[3],priceDate:iso(cash[4]),value:amount(cash[5]),weight:amount(cash[6])/100,assetClass:category,page:pendingPage};}
    else throw new Error(`A holding on page ${pendingPage} could not be read completely. Nothing was imported; check the statement layout.`);
    if(!category || !Number.isFinite(position.value) || position.value<0 || position.weight<0 || position.weight>1)throw new Error(`Invalid position values on page ${pendingPage}.`);
    (position.isin?report.positions:report.cash).push(position);pending='';
  }
  for(const page of all) {
    const content=page.rows.map(r=>r.text).join('\n');
    if(/Detailpositionen/.test(content)) {
      const pageCurrency=content.match(/Detailpositionen[^\n]*in ([A-Z]{3})/);if(pageCurrency&&pageCurrency[1]!==currency)throw new Error('Position values and cover use different currencies. Review required.');
      for(const row of page.rows){
        const line=row.text;
        if(classes[line]){flush();category=classes[line];continue;}
        if(/^Total\b/.test(line)){flush();continue;}
        if(new RegExp(`^[A-Z]{3} ${numeric} `).test(line)){flush();pending=line;pendingPage=page.page;continue;}
        // Wrapped security names can continue within a page or on the next holdings page.
        if(pending && !securityRow.test(pending)&&!cashRow.test(pending) && !/Privatbank|Depot-Nr|Detailpositionen|Stück \/|^Whg |s\. a\. & o\.|^Seite /.test(line))pending+=' '+line;
      }
      if(securityRow.test(pending)||cashRow.test(pending))flush();
    } else {
      flush();
      if(/Performance Übersicht/.test(content)&&report.performance) {
        const perf=report.performance;
        const year=perf.end.slice(0,4);
        // The first seven cells are the table; chart-axis labels may follow to the right.
        const annual=content.match(new RegExp(`^${year} ${currency} (${numeric}) (${numeric}) (${numeric}) (${numeric}) (${numeric}) %`,'m'));
        if(annual){perf.opening=amount(annual[1]);perf.netFlows=amount(annual[2]);perf.closing=amount(annual[3]);perf.profit=amount(annual[4]);perf.page=page.page;
          if(Math.abs(perf.closing-total)>2 || Math.abs(perf.closing-perf.opening-perf.netFlows-perf.profit)>3 || Math.abs(amount(annual[5])/100-perf.twr)>.00011)throw new Error('Performance figures do not reconcile to the cover. Nothing was imported.');
        }
      }
      if(/Performancedetails vom/.test(content)) {
        const profit=content.match(new RegExp(`^Erfolg (${numeric}) (${numeric}) (${numeric}) (${numeric}) (${numeric})`,'m'));
        const shares=content.match(new RegExp(`^Erfolgsanteil in % (${numeric}) % (${numeric}) % (${numeric}) % (${numeric}) %`,'m'));
        const mwr=content.match(new RegExp(`^Erfolg in % \\(MWR\\) (${numeric}) % (${numeric}) % (${numeric}) % (${numeric}) %`,'m'));
        if(profit)report.contributions.push(...['Cash','Bonds','Equities','Alternatives'].map((assetClass,i)=>({assetClass,profit:amount(profit[i+1]),profitShare:shares?amount(shares[i+1])/100:undefined,mwr:mwr?amount(mwr[i+1])/100:undefined,page:page.page})));
      }
      if(/Grafische Portfoliostruktur/.test(content)) {
        // Locate chart columns by their headings, retaining each chart's denominator.
        const charts:[string,PdfAllocation['dimension'],PdfAllocation['scope']][]=[['Portfolio nach Anlagekategoriengruppen','asset','portfolio'],['Portfolio nach Währungen','currency','portfolio'],['Aktien nach Ländergruppen','region','equities'],['Aktien nach Branchengruppen','industry','equities']];
        for(const [heading,dimension,scope] of charts){
          const headingRow=page.rows.find(r=>r.items.some(i=>i.text===heading));if(!headingRow)continue;
          const x=headingRow.items.find(i=>i.text===heading)!.x;
          const right=headingRow.items.filter(i=>i.x>x+20).sort((a,b)=>a.x-b.x)[0]?.x ?? Infinity;
          for(const row of page.rows.filter(r=>r.y<headingRow.y)){
            const line=row.items.filter(i=>i.x>=x-2&&i.x<right-5).map(i=>i.text).join(' ').trim();
            if(/Nachhaltigkeit|Aufteilung |Aktien nach |s\. a\. & o\./.test(line))break;
            const entry=line.match(new RegExp(`^(.+?) (${numeric}) %$`));
            if(entry)report.allocations.push({dimension,scope,label:entry[1],weight:amount(entry[2])/100,page:page.page});
          }
        }
      }
    }
  }
  flush();
  if(!report.positions.length&&!report.cash.length)throw new Error('No complete positions were found. Scanned or unsupported layouts cannot be imported.');
  report.reconciliation=report.positions.concat(report.cash).reduce((n,p)=>n+p.value,0)-total;
  // Each printed whole-currency amount contributes at most half a unit of rounding.
  const tolerance=Math.max(2,(report.positions.length+report.cash.length+1)*.5);
  if(Math.abs(report.reconciliation)>tolerance)throw new Error(`Holdings do not reconcile: ${currency} ${report.reconciliation.toFixed(2)} difference. The statement may be incomplete. Nothing was imported.`);
  const weights=report.positions.concat(report.cash).reduce((n,p)=>n+p.weight,0);
  if(Math.abs(weights-1)>Math.max(.0002,(report.positions.length+report.cash.length+1)*.00005))throw new Error('Position weights do not reconcile to 100%. Nothing was imported.');
  for(const p of report.positions.concat(report.cash))if(Math.abs(p.value/total-p.weight)>.00006+1/total)throw new Error(`The value and weight of ${p.name} disagree. Review required.`);
  const bad=new Set(report.positions.filter(p=>!validIsin(p.isin!)).map(p=>p.isin));
  if(bad.size)report.warnings.push(`${bad.size} security identifiers fail ISIN validation. Holdings are retained; automatic identifier matching is disabled for them.`);
  if(!report.performance?.profit)report.warnings.push('Complete cash-flow and profit details were not available.');
  report.warnings.push('Historical statement snapshot. Daily returns and fund constituents are not supplied. Selected transactions remain in the original PDF.');
  return report;
}

const normalizedName=(s:string)=>s.toLowerCase().replace(/^(n-akt|i-akt|akt|ant)\s+/,'').replace(/[^a-z0-9]/g,'');
export function identityIssue(position: PdfPosition, dataset: Dataset): string|undefined {
  if(!validIsin(position.isin!))return 'Invalid ISIN checksum';
  const matches=dataset.reference.Securities.filter(s=>s.Isin===position.isin&&!s.ExternalSource);
  if(matches.length && !matches.some(s=>normalizedName(s.Name||'')===normalizedName(position.name)&&s.Currency===position.currency&&s.SecurityTypeName===instrumentType(position)))return 'Reference identity differs; retained separately';
}
export function attachCustodyReport(dataset:Dataset, report:CustodyReport, target:number|'new') {
  const portfolios=dataset.clients.flatMap(c=>list(c.Portfolios));
  const duplicate=dataset.clients.flatMap(c=>list(c.Portfolios).flatMap(p=>[p,...list(p.PreviousSnapshots)].map(s=>({client:c,portfolio:p,snapshot:s})))).find(x=>x.snapshot.ExternalSource?.hash===report.hash);
  if(duplicate)return {dataset,clientId:duplicate.client.ClientId as number,portfolioId:duplicate.portfolio.PortfolioId as number,duplicate:true};
  let customer=target==='new'?undefined:dataset.clients.find(c=>c.ClientId===target);
  if(target!=='new'&&!customer)throw new Error('Choose an existing client or create a new one.');
  // Never attach a known depot to another owner by accident.
  const ownerOfAccount=dataset.clients.find(c=>list(c.Portfolios).some(p=>p.ExternalSource?.account===report.account&&p.ExternalSource?.bank===report.bank));
  if(ownerOfAccount && ownerOfAccount.ClientId!==customer?.ClientId)throw new Error('This depot is already attached to another client. Select that client to update it.');
  const nextId=(values:number[])=>Math.max(0,...values)+1;
  const clientId=customer?.ClientId??nextId(dataset.clients.map(c=>c.ClientId));
  const previous=list(customer?.Portfolios).find(p=>p.ExternalSource?.account===report.account&&p.ExternalSource?.bank===report.bank);
  if(previous&&report.asOf<=previous.FactoryDateUtc.slice(0,10))throw new Error('This depot already has a snapshot on this date or later. No holdings were changed.');
  const portfolioId=previous?.PortfolioId??nextId(portfolios.map(p=>p.PortfolioId));
  let securityId=nextId(dataset.reference.Securities.map(s=>s.Id));
  const masters:Row[]=[], positions=report.positions.map(p=>{
    const id=securityId++, issue=identityIssue(p,dataset), matching=issue?undefined:dataset.reference.Securities.find(s=>s.Isin===p.isin&&!s.ExternalSource);
    masters.push({Id:id,Name:p.name,Isin:issue?undefined:p.isin,ReportedIsin:p.isin,SecurityTypeName:instrumentType(p),Currency:p.currency,SAA_AssetClassName:p.assetClass,IndustryName:matching?.IndustryName,CountryName:matching?.CountryName,ExternalSource:report.hash});
    return {SecurityId:id,SecurityName:p.name,ReportedIsin:p.isin,IdentityIssue:issue,SourcePage:p.page,Quantity:p.quantity,PricePerUnit:p.price,CostPrice:p.cost,PriceDateUtc:p.priceDate,Currency:p.currency,TotalAmountInPortfolioCurrency:p.value,PortfolioValuePercentage:p.weight,QuoteBasis:p.assetClass==='Bonds'?'Percent of nominal':'Per unit'};
  });
  const portfolio:Row={PortfolioId:portfolioId,PortfolioNr:`External · ${report.bank} · ${report.account.slice(-4)}`,Name:`${report.bank} — ${report.strategy}`,PortfolioCurrency:report.currency,ReferenceCurrency:report.currency,StrategyName:report.strategy,InvestmentServiceName:'External custody',FactoryDateUtc:report.asOf,AssetsUnderManagementInDefaultCurrency:report.total,LiquidityInDefaultCurrency:report.cash.reduce((n,p)=>n+p.value,0),SecurityPositions:positions,AccountPositions:report.cash.map(p=>({Currency:p.currency,TotalAmountInPortfolioCurrency:p.value,PortfolioValuePercentage:p.weight,SourcePage:p.page})),PerformanceHistory:[],ReportedPerformance:report.performance,ReportedContributions:report.contributions,ReportedAllocations:report.allocations,ExternalSource:{hash:report.hash,fileName:report.fileName,owner:report.owner,bank:report.bank,account:report.account,asOf:report.asOf,pages:report.pages,importedAt:new Date().toISOString(),warnings:report.warnings,reconciliation:report.reconciliation},PreviousSnapshots:previous?[...list(previous.PreviousSnapshots),{...previous,PreviousSnapshots:undefined}]:[]};
  if(!customer){const name=report.owner.replace(/^(Herr|Frau)\s+/,'');const company=/\b(AG|GmbH|Holding|Pensionskasse)\b/.test(name);customer={ClientId:clientId,ClientRef:`PDF-${clientId}`,FirstName:company?undefined:name,Company:company?name:undefined,IsClientACompany:company?true:/^(Herr|Frau) /.test(report.owner)?false:undefined,ReportingCurrency:report.currency,Portfolios:[],ClientNotes:[],Proposals:[],SuitabilityViolations:[],Transactions:[]};}
  const updated={...customer,Portfolios:[...list(customer.Portfolios).filter(p=>p.PortfolioId!==portfolioId),portfolio]};
  return {dataset:{...dataset,version:'Imported · client workspace',clients:dataset.clients.some(c=>c.ClientId===clientId)?dataset.clients.map(c=>c.ClientId===clientId?updated:c):[...dataset.clients,updated],reference:{...dataset.reference,Securities:[...dataset.reference.Securities,...masters]}},clientId,portfolioId,duplicate:false};
}
