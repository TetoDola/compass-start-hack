import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseCustodyPages, type PdfPage, type PdfTextItem } from './pdfImport';
GlobalWorkerOptions.workerSrc=workerUrl;
export async function readCustodyPdf(file:File,onProgress:(done:number,total:number)=>void) {
  const start=performance.now(), bytes=new Uint8Array(await file.arrayBuffer());
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const task=getDocument({data:bytes,useSystemFonts:true});
  try {
    const doc=await task.promise, pages:PdfPage[]=[];
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i), content=await page.getTextContent();
      pages.push({page:i,items:content.items.filter((item):item is typeof item & PdfTextItem=>'str' in item).map(item=>({str:item.str,transform:item.transform}))});
      onProgress(i,doc.numPages);page.cleanup();
    }
    return {...parseCustodyPages(pages,file.name,hash),elapsedMs:Math.round(performance.now()-start)};
  } finally {await task.destroy();}
}
