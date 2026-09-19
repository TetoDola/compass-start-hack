import type { Dataset } from './types';
const DB='compass-imports';
function openDb():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore('workspace');r.result.createObjectStore('documents');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Browser storage is unavailable. The import was not saved.'));});
}
export async function loadImportedWorkspace():Promise<Dataset|undefined> {
  const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('workspace'),r=tx.objectStore('workspace').get('dataset');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();tx.onabort=()=>db.close();});
}
export async function saveImportedWorkspace(dataset:Dataset,document?:{hash:string;file:Blob}) {
  const db=await openDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['workspace','documents'],'readwrite');tx.objectStore('workspace').put(dataset,'dataset');if(document)tx.objectStore('documents').put(document.file,document.hash);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(new Error('The import could not be saved in this browser. Free some storage and retry.'));};tx.onerror=()=>{};});
}
export async function clearImportedWorkspace() {
  const db=await openDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['workspace','documents'],'readwrite');tx.objectStore('workspace').clear();tx.objectStore('documents').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(new Error('Could not clear imported data.'));};});
}
export async function openSourcePdf(hash:string,page:number) {
  const tab=window.open('','_blank');if(tab)tab.opener=null;
  try {
    const db=await openDb();const file=await new Promise<Blob|undefined>((resolve,reject)=>{const tx=db.transaction('documents'),r=tx.objectStore('documents').get(hash);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});
    if(!file)throw new Error('The original PDF is not available in this browser.');
    const url=URL.createObjectURL(file);if(tab)tab.location.href=`${url}#page=${page}`;else{URL.revokeObjectURL(url);throw new Error('Allow this page to open the source PDF in a new tab.');}
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(error){tab?.close();throw error;}
}
