import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFundResolver, parseFundPage } from './fund-holdings';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const html = readFileSync(new URL('./fixtures/top-holdings.html', import.meta.url), 'utf8');
test('published top-ten parsing preserves the date, security identity and partial weights', () => {
  const result = parseFundPage(html, 'IE00B4L5Y983');
  assert.equal(result.asOf, '2026-07-30');
  assert.equal(result.holdings.length, 10);
  assert.equal(result.holdings[0].name, 'Apple');
  assert.equal(result.holdings[0].isin, 'US0378331005');
  assert.equal(result.holdings[0].weight, .0548);
  assert.equal(result.holdings[9].name, 'JPMorgan Chase & Co.');
  assert.ok(Math.abs(result.holdings.reduce((sum, h) => sum + h.weight, 0) - .2597) < .00001);
});
test('source mismatch, missing dates and invalid totals cannot become holdings', () => {
  assert.throws(() => parseFundPage(html, 'IE00B5BMR087'), /ISIN/);
  assert.throws(() => parseFundPage(html.replace('30/07/2026', 'unknown'), 'IE00B4L5Y983'), /dated/);
  assert.throws(() => parseFundPage(html.replace('25.97%', '100%'), 'IE00B4L5Y983'), /reconcile/);
  assert.throws(() => parseFundPage(html.replace('5.48%', '-5.48%'), 'IE00B4L5Y983'), /valid/);
});

test('aged snapshots refresh automatically and retain dated fallback on source failure', async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'compass-funds-')),original=globalThis.fetch;
 const isin='IE00B4L5Y983',seed={...parseFundPage(html,isin),asOf:new Date(Date.now()-45*86400000).toISOString().slice(0,10),retrievedAt:new Date(Date.now()-2*86400000).toISOString()};
 await mkdir(path.join(root,'data'));await writeFile(path.join(root,'data/fund-holdings.json'),JSON.stringify([seed]));
 let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('offline');};
 try {
  const resolve=createFundResolver(root);
  const fallback=await resolve(isin);assert.equal(calls,1);assert.equal(fallback.cached,true);assert.equal(fallback.stale,true);assert.match(fallback.warning!,/Refresh unavailable/);assert.deepEqual(fallback.snapshot,seed);
  await resolve(isin);assert.equal(calls,1,'failure cooldown prevents repeated automatic fetches');
  const date=new Date(Date.now()-86400000).toISOString().slice(0,10),[y,m,d]=date.split('-');
  globalThis.fetch=async()=>{calls++;return new Response(html.replace('30/07/2026',`${d}/${m}/${y}`));};
  const fresh=await resolve(isin,true);assert.equal(calls,2);assert.equal(fresh.stale,false);assert.equal(fresh.cached,false);assert.equal(fresh.snapshot.asOf,date);
  assert.equal((await resolve(isin)).cached,true);assert.equal(calls,2);
 }finally{globalThis.fetch=original;await rm(root,{recursive:true,force:true});}
});

test('a provider response cannot overwrite newer cached holdings with an older snapshot',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'compass-funds-')),original=globalThis.fetch,isin='IE00B4L5Y983';
 const snapshot={...parseFundPage(html,isin),asOf:new Date(Date.now()-86400000).toISOString().slice(0,10)};
 await mkdir(path.join(root,'.cache/fund-holdings'),{recursive:true});
 const file=path.join(root,'.cache/fund-holdings',`${isin}.json`);await writeFile(file,JSON.stringify(snapshot));
 globalThis.fetch=async()=>new Response(html);
 try{const result=await createFundResolver(root)(isin,true);assert.equal(result.snapshot.asOf,snapshot.asOf);assert.equal(result.stale,true);assert.match(result.warning!,/older holdings/);assert.equal(JSON.parse(await readFile(file,'utf8')).asOf,snapshot.asOf);}
 finally{globalThis.fetch=original;await rm(root,{recursive:true,force:true});}
});
