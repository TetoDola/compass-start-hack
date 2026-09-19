import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteResolver, parseInstrumentQuote, parseIsinListing, parseFigiListing } from './instrument-quotes';
import { isValidIsin } from '../src/lib/securityIdentity';
import type { QuoteInstrument } from '../src/lib/quotes';

const now=Date.parse('2026-09-19T12:00:00Z');
const stock:QuoteInstrument={isin:'US0378331005',name:'Apple',type:'Shares'};
const fund:QuoteInstrument={isin:'IE00B4L5Y983',name:'iShares World',type:'Investment fund'};
const row={symbol:'AAPL',longname:'Apple Inc.',quoteType:'EQUITY',isYahooFinance:true,exchDisp:'NASDAQ'};
const chart=(symbol='AAPL',instrumentType='EQUITY',extra={})=>({chart:{result:[{meta:{symbol,instrumentType,regularMarketPrice:123.45,regularMarketTime:Math.floor(now/1000)-3600,currency:'USD',...extra}}]}});

test('ISIN resolution validates check digit, compatible type and unambiguous provider listing',()=>{
  assert.equal(isValidIsin(stock.isin),true);assert.equal(isValidIsin('US0378331006'),false);assert.equal(isValidIsin('AAPL'),false);
  assert.equal(parseIsinListing({quotes:[row]},stock).symbol,'AAPL');
  assert.throws(()=>parseIsinListing({quotes:[row,{...row,symbol:'APC.F'}]},stock),/multiple listings/);
  assert.throws(()=>parseIsinListing({quotes:[row]},fund),/No compatible listing/);
  assert.throws(()=>parseIsinListing({quotes:[{...row,isin:'CH0038863350'}]},stock),/No compatible listing/);
  assert.throws(()=>parseIsinListing({quotes:[{...row,isYahooFinance:false}]},stock),/No compatible listing/);
});

test('quotes require matching symbol/type and provider price, currency and observation timestamp',()=>{
  const listing=parseIsinListing({quotes:[row]},stock);
  const quote=parseInstrumentQuote(chart(),stock,listing,now);
  assert.equal(quote.price,123.45);assert.equal(quote.asOf,'2026-09-19T11:00:00.000Z');assert.equal(quote.kind,'exchange');
  assert.throws(()=>parseInstrumentQuote(chart('MSFT'),stock,listing,now),/did not match/);
  assert.throws(()=>parseInstrumentQuote(chart('AAPL','ETF'),stock,listing,now),/did not match/);
  for(const bad of [{regularMarketTime:undefined},{regularMarketTime:now/1000+1},{regularMarketPrice:0},{regularMarketPrice:'123'},{currency:undefined}])assert.throws(()=>parseInstrumentQuote(chart('AAPL','EQUITY',bad),stock,listing,now));
  const pence=parseInstrumentQuote(chart('AAPL','EQUITY',{currency:'GBp'}),stock,listing,now);
  assert.equal(pence.currency,'GBp');assert.match(pence.message,/pence/);
});

test('mutual fund NAV is distinct from exchange price and old observations are stale',()=>{
  const listing=parseIsinListing({quotes:[{...row,symbol:'FUND',quoteType:'MUTUALFUND'}]},fund);
  const quote=parseInstrumentQuote(chart('FUND','MUTUALFUND',{regularMarketTime:now/1000-8*86400}),fund,listing,now);
  assert.equal(quote.kind,'nav');assert.equal(quote.state,'stale');assert.match(quote.message,/NAV/);
  const exchange=parseIsinListing({quotes:[row]},stock);
  assert.equal(parseInstrumentQuote(chart('AAPL','EQUITY',{regularMarketTime:now/1000-5*86400}),stock,exchange,now).state,'stale');
});

test('live lookup uses only exact ISIN and resolved symbol; shares cache and force-refreshes',async()=>{
  const calls:URL[]=[];
  const request:typeof fetch=async input=>{const u=new URL(String(input));calls.push(u);return new Response(JSON.stringify(u.pathname.includes('/search')?{quotes:[row]}:chart()));};
  const resolve=createQuoteResolver(request,()=>now);
  const results=await Promise.all([resolve(stock),resolve({...stock,name:'Different portfolio label'})]);
  assert.equal(results[0].state,'available');assert.equal(calls.length,2);
  assert.equal(calls[0].searchParams.get('q'),stock.isin);assert.equal(calls[0].searchParams.get('enableFuzzyQuery'),'false');
  assert.match(calls[1].pathname,/\/AAPL$/);assert.ok(calls.every(u=>!u.href.includes('portfolio')));
  await resolve(stock);assert.equal(calls.length,2);
  await resolve(stock,true);assert.equal(calls.length,4);
});

test('invalid IDs make no requests; ambiguous search and provider failure never invent a quote',async()=>{
  let count=0;
  const resolve=createQuoteResolver(async()=>{count++;return new Response(JSON.stringify({quotes:[row,{...row,symbol:'APC.F'}]}));},()=>now);
  assert.equal((await resolve({...stock,isin:'US0378331006'})).state,'unavailable');assert.equal(count,0);
  const ambiguous=await resolve(stock);assert.equal(ambiguous.state,'unavailable');assert.equal(ambiguous.price,undefined);assert.equal(count,2);
  const failed=createQuoteResolver(async()=>new Response('',{status:429}),()=>now);
  assert.equal((await failed(fund)).state,'unavailable');
});

test('failed refresh never serves the previous price as a new observation',async()=>{
  let fail=false;
  const resolve=createQuoteResolver(async input=>fail?new Response('',{status:503}):new Response(JSON.stringify(String(input).includes('/search')?{quotes:[row]}:chart())),()=>now);
  assert.equal((await resolve(stock)).state,'available');fail=true;
  const refreshed=await resolve(stock,true);assert.equal(refreshed.state,'unavailable');assert.equal(refreshed.price,undefined);
});

test('missing Yahoo ISIN mappings use exact OpenFIGI identity, never a name-derived ticker',async()=>{
  const alphabet={...stock,isin:'US02079K3059',name:'Alphabet'};
  const mapping={ticker:'GOOGL',name:'ALPHABET INC-CL A',exchCode:'US',marketSector:'Equity',securityType2:'Common Stock',shareClassFIGI:'BBG009S39JY5'};
  assert.equal(parseFigiListing([{data:[mapping]}],alphabet).symbol,'GOOGL');
  assert.throws(()=>parseFigiListing([{data:[mapping,{...mapping,shareClassFIGI:'DIFFERENT'}]}],alphabet),/unambiguous/);
  assert.throws(()=>parseFigiListing([{data:[{...mapping,exchCode:'GR'}]}],alphabet));
  assert.throws(()=>parseFigiListing([{data:[mapping]}],fund));
  const resolve=createQuoteResolver(async(input,init)=>{
    const u=String(input);
    if(u.includes('openfigi')){assert.deepEqual(JSON.parse(String(init?.body)),[{idType:'ID_ISIN',idValue:alphabet.isin,exchCode:'US'}]);return new Response(JSON.stringify([{data:[mapping]}]));}
    return new Response(JSON.stringify(u.includes('/search')?{quotes:[]}:chart('GOOGL')));
  },()=>now);
  const quote=await resolve(alphabet);assert.equal(quote.state,'available');assert.equal(quote.symbol,'GOOGL');assert.match(quote.resolution!,/OpenFIGI/);
});

test('unauthenticated mapping fallback stays within its request budget',async()=>{
  let mappings=0;
  const resolve=createQuoteResolver(async input=>{if(String(input).includes('openfigi')){mappings++;return new Response('[{"data":[]}]');}return new Response('{"quotes":[]}');},()=>now);
  for(let i=0;i<20;i++)await resolve(stock,true);
  assert.match((await resolve(stock,true)).message,/request limit/);assert.equal(mappings,20);
});
