import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMarketContext } from './loadContext';

test('all exposure batches are attempted and a failed batch preserves other results',async()=>{
  const original=globalThis.fetch,calls:number[]=[];let active=0,peak=0;
  globalThis.fetch=async(_url,init)=>{
    const request=JSON.parse(String(init?.body));calls.push(request.targets.length);active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,1));active--;
    if(request.targets[0].id==='12')return new Response('',{status:503});
    return new Response(JSON.stringify({items:[],checked:request.targets.length,checkedIds:request.targets.map((t:any)=>t.id),warnings:[],providers:[]}));
  };
  try {
    const targets=Array.from({length:25},(_,i)=>({id:String(i),name:`Company ${i}`,via:'Direct position',weight:.01}));
    const result=await loadMarketContext(targets,{signal:new AbortController().signal});
    assert.deepEqual(calls,[12,12,1]);assert.equal(peak,2);assert.equal(result.requested,25);assert.equal(result.checked,13);assert.equal(result.checkedIds?.length,13);assert.match(result.warnings.join(' '),/failed/);
  } finally {globalThis.fetch=original;}
});
