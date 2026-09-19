import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { runInNewContext } from 'node:vm';
import { schemaFor, normalizeForSchema, compareSource, summarizeRun } from '../scripts/reingestion-quality';
import { renderIngestionReport } from '../scripts/render-ingestion-report';

test('dynamic extraction schemas describe shape and never echo source values',()=>{
  const source={clientName:'Unique source name 88721',balance:9876543.21,holdings:[{isin:'CH0012005267',currency:'CHF',price:112.347}],note:'Never use this sentence as a schema hint'};
  const schema=schemaFor(source),serialized=JSON.stringify(schema);
  for(const value of ['Unique source name 88721','9876543.21','CH0012005267','CHF','112.347','Never use this sentence'])assert.ok(!serialized.includes(value),`source value leaked: ${value}`);
  assert.equal(schema.properties.balance.type,'number');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.holdings.items.additionalProperties,false);
  assert.deepEqual(schema.required.sort(),Object.keys(source).sort());
  assert.ok(!/"(?:const|enum|default|examples)":/.test(serialized));
});

test('heterogeneous source rows normalize absent fields to null without changing present facts',()=>{
  const source=[{id:1,name:'First',price:0,metadata:{currency:'CHF'}},{id:2,enabled:false,metadata:{exchange:'SIX'}},{id:3,name:null}];
  const schema=schemaFor(source),normalized=normalizeForSchema(source,schema);
  assert.deepEqual(normalized,[
    {id:1,name:'First',price:0,metadata:{currency:'CHF',exchange:null},enabled:null},
    {id:2,name:null,price:null,metadata:{currency:null,exchange:'SIX'},enabled:false},
    {id:3,name:null,price:null,metadata:null,enabled:null},
  ]);
  assert.deepEqual(schema.items.properties.name.type,['string','null']);
  assert.deepEqual(source[2],{id:3,name:null},'normalization must not mutate source records');
});

test('source comparator detects dropped array rows and the missing facts within them',()=>{
  const expected={holdings:[{isin:'CH0012005267',price:94.12},{isin:'US0378331005',price:245.5}]};
  const result=compareSource(expected,{holdings:[expected.holdings[0]]});
  assert.equal(result.checks,5);
  assert.equal(result.passed,2);
  assert.ok(result.issues.some(issue=>issue.includes('data.holdings.length')));
  assert.ok(result.issues.some(issue=>issue.includes('data.holdings[1].isin')));
});

test('source comparator detects changed financial values and extra hallucinated fields',()=>{
  const expected={price:94.12,currency:'CHF'};
  const result=compareSource(expected,{price:941.2,currency:'CHF',country:'Switzerland'});
  assert.equal(result.checks,3);
  assert.equal(result.passed,1);
  assert.ok(result.issues.some(issue=>issue.includes('data.price')));
  assert.ok(result.issues.some(issue=>issue.includes('data.country')&&issue.includes('no additional field')));
  assert.equal(compareSource(expected,{price:'94.12',currency:'CHF'}).passed,1,'a string price is not a source number');
});

test('numeric tolerance accepts tiny rounding only, not changes to price or weight precision',()=>{
  const expected={price:101.123456,weight:0.037812};
  const rounded=compareSource(expected,{price:101.1234564,weight:0.0378124});
  assert.equal(rounded.passed,rounded.checks);
  for(const price of [101.123459,101.13,Number.NaN,Infinity]){
    const result=compareSource(expected,{price,weight:expected.weight});
    assert.equal(result.passed,1);
    assert.equal(result.checks,2);
  }
});

test('failed calls never become perfect extraction scores or completed corpus coverage',()=>{
  const failed={id:'job-failed',kind:'clients',state:'failed',issues:['Provider timeout']};
  const onlyFailed=summarizeRun({scope:{plannedJobs:10},jobs:[failed]});
  assert.equal(onlyFailed.sourceAgreement,null);
  assert.equal(onlyFailed.checks,0);
  assert.equal(onlyFailed.passedJobs,0);
  assert.equal(onlyFailed.failedJobs,1);
  assert.equal(onlyFailed.completedJobs,1);
  assert.equal(onlyFailed.plannedJobs,10);
  const mixed=summarizeRun({scope:{plannedJobs:10},jobs:[failed,{id:'job-passed',kind:'clients',state:'passed',metrics:{checks:4,passed:4}}]});
  assert.equal(mixed.sourceAgreement,1,'agreement is conditional on actual measured checks');
  assert.equal(mixed.passedJobs,1);
  assert.equal(mixed.failedJobs,1);
  assert.equal(mixed.completedJobs,2);
  assert.equal(mixed.byKind.clients.failed,1);
  assert.equal(mixed.byKind.clients.checks,4,'a failed call contributes no invented checks');
});

test('report caps huge raw previews without dropping issue text or changing totals',()=>{
  const huge='x'.repeat(100_000)+'UNRENDERED_TAIL';
  const run={model:'MiniMax M3',startedAt:'2026-09-19T12:00:00Z',scope:{plannedJobs:600},jobs:[{id:'fund-mapping-42-1',kind:'fund-mappings',source:'reference.json',state:'review',durationMs:12,metrics:{checks:48000,passed:47999},issues:['Row 47999 has a changed weight.'],expected:{data:huge},actual:{data:huge}}]};
  const html=renderIngestionReport(run),doc=load(html);
  assert.equal(doc('.preview-note').length,2);
  assert.ok(!html.includes('UNRENDERED_TAIL'));
  assert.ok(html.length<65000);
  assert.ok(doc('.issues').text().includes('Row 47999'));
  assert.ok(doc('.score-fraction').text().includes('47,999 of 48,000'));
  assert.equal(doc('.score-value').text(),'>99.9%','a nearly perfect result must not round to100%');
  assert.equal(doc('.artifact-link').attr('href'),'jobs/fund-mapping-42-1.json');
});

test('report escapes model text and rejects unsafe job artifact paths',()=>{
  const job={id:'../../credentials',kind:'pdf',source:'<script>alert(1)</script>',state:'failed',issues:['<img src=x onerror=bad()>'],actual:{API_KEY:'DO_NOT_RENDER_KEY'}};
  const doc=load(renderIngestionReport({model:'</title><img src=x>',scope:{},jobs:[job]}));
  assert.equal(doc('script').length,1,'only the fixed report-filter script is present');
  assert.equal(doc('img').length,0);
  assert.equal(doc('.artifact-link').length,0);
  assert.equal(doc('.job h3').text(),'<script>alert(1)</script>');
  assert.ok(!doc.html().includes('DO_NOT_RENDER_KEY'));
});

test('report separates source replay, labeled news accuracy and unlabeled live grounding',()=>{
  const run={model:'MiniMax M3',scope:{plannedJobs:700,selectedJobs:631},limitations:['Headlines only; source facts may be wrong.'],pdfAssessment:{status:'review',note:'Parser comparison is not independent evidence.'},jobs:[
    {id:'client-1',kind:'clients',state:'review',metrics:{checks:4,passed:3},issues:['Source field changed'],expected:{name:'Original'},actual:{name:'Changed'}},
    {id:'news-labels',kind:'news-labeled-quality',state:'review',metrics:{checks:200,passed:199},labelMetrics:{cases:25,correct:24,falsePositives:1,falseNegatives:0},issues:[],actual:{cases:[]}},
    {id:'news-entities-1',kind:'news-entities',state:'passed',metrics:{checks:100,passed:100},issues:[],actual:{entities:[]},baselineDisagreements:[{articleId:'article-1',modelOnly:['issuer-2'],baselineOnly:[]}],validationLimitation:'Allowed IDs and quoted spans do not establish semantic accuracy.'},
  ]};
  const doc=load(renderIngestionReport(run));
  assert.equal(doc('.score-value').text(),'75.0%');
  assert.equal(doc('.score-fraction').text(),'3 of 4 reported checks passed');
  const news=doc('.news-quality').text();
  assert.ok(news.includes('24 / 25'));
  assert.ok(news.includes('96.0% on labeled synthetic cases'));
  assert.ok(news.includes('1 false positives'));
  assert.ok(news.includes('100 / 100'));
  assert.ok(news.includes('not semantic accuracy or recall'));
  assert.ok(doc('.overview .stat').first().text().includes('3 / 631'),'selected corpus size is the progress denominator');
  assert.equal(doc('.run-limitations li').text(),run.limitations[0]);
  const live=doc('.job[data-kind="news-entities"]');
  assert.equal(live.find('.validation-limitation').text(),run.jobs[2].validationLimitation);
  assert.ok(live.find('.baseline-disagreements').text().includes('modelOnly'));
  assert.ok(!live.find('.comparison').text().includes('Expected / source reference'),'unlabeled live jobs have no invented expected output');
  assert.ok(doc('.scope').text().includes('Parser comparison is not independent evidence.'));
});

test('perfect live grounding alone cannot become a source-replay quality score',()=>{
  const doc=load(renderIngestionReport({scope:{selectedJobs:5},jobs:[{id:'news-entities-1',kind:'news-entities',state:'passed',metrics:{checks:100,passed:100},issues:[]}]}));
  assert.equal(doc('.score-value').text(),'—');
  assert.equal(doc('.score-fraction').text(),'0 of 0 reported checks passed');
  assert.ok(doc('.news-quality').text().includes('100 / 100'));
  assert.ok(doc('.news-quality').text().includes('Not measured'));
});

test('report exposes per-kind failures and missing PDF facts separately from large source batches',()=>{
  const doc=load(renderIngestionReport({scope:{selectedJobs:4},jobs:[
    {id:'fund-1',kind:'fund-mappings',state:'passed',metrics:{checks:48000,passed:48000}},
    {id:'pdf-1',kind:'pdf',state:'review',metrics:{checks:10,passed:4}},
    {id:'pdf-2',kind:'pdf',state:'failed'},
    {id:'news-1',kind:'news-entities',state:'passed',metrics:{checks:100,passed:100}},
  ],pdfAssessment:{summary:{documents:2,withModelOutput:1,factualMetrics:{sourceFacts:{checks:100,passed:40},matchedFacts:{checks:50,passed:40},missingOrAmbiguousFacts:50,unsupportedValues:2,schemaIssues:3},coreMetrics:{sourceFacts:{checks:80,passed:30}}}}}));
  assert.equal(doc('.source-kinds tbody tr').length,2,'live grounding has its separate evaluation');
  const pdfRow=doc('.source-kinds tbody tr').filter((_index,row)=>doc(row).find('th').text()==='pdf');
  assert.deepEqual(pdfRow.find('td').map((_index,cell)=>doc(cell).text()).get(),['2','0','1','1','4 / 10']);
  const facts=doc('.pdf-quality .stat').eq(0),matched=doc('.pdf-quality .stat').eq(2);
  assert.equal(facts.find('strong').text(),'40.0%');
  assert.ok(facts.text().includes('50 missing or ambiguous facts'));
  assert.equal(matched.find('strong').text(),'80.0%');
  assert.ok(doc('.pdf-quality').text().includes('1 / 2'));
});

test('report initially hides cards after20, paginates and searches every job',()=>{
  const jobs=Array.from({length:45},(_,i)=>({id:`record-${i+1}`,kind:'clients',state:'passed',issues:[]}));
  const doc=load(renderIngestionReport({scope:{selectedJobs:45},jobs}));
  assert.equal(doc('.job:not([hidden])').length,20);
  assert.equal(doc('.job[hidden]').length,25);
  assert.equal(doc('#show-more').text(),'Show 20 more');
  const nodes=doc('.job').map((_index,element)=>({dataset:{state:doc(element).attr('data-state'),kind:doc(element).attr('data-kind')},textContent:doc(element).text(),hidden:doc(element).attr('hidden')!==undefined})).get();
  const elements:Record<string,any>={};
  for(const id of ['search','status','kind','filter-count','empty','show-more'])elements[id]={value:id==='status'||id==='kind'?'all':'',textContent:'',hidden:false,events:{},addEventListener(event:string,fn:()=>void){this.events[event]=fn;}};
  runInNewContext(doc('script').text(),{document:{getElementById:(id:string)=>elements[id],querySelectorAll:()=>nodes}});
  elements['show-more'].events.click();
  assert.equal(nodes.filter(node=>!node.hidden).length,40);
  assert.equal(elements['show-more'].textContent,'Show 5 more');
  elements.search.value='record-45';elements.search.events.input();
  assert.equal(nodes.filter(node=>!node.hidden).length,1,'search includes records hidden from the initial page');
  assert.equal(nodes[44].hidden,false);
  assert.equal(elements['show-more'].hidden,true);
  elements.search.value='';elements.search.events.input();
  assert.equal(nodes.filter(node=>!node.hidden).length,20,'changing filters resets pagination');
});

test('report makes omitted security portfolios visible alongside conditional monetary agreement',()=>{
  const doc=load(renderIngestionReport({scope:{},jobs:[],pdfAssessment:{summary:{documents:10,withModelOutput:10,factualMetrics:{sourceFacts:{checks:6140,passed:5871},matchedFacts:{checks:5871,passed:5871},categories:{monetary:{checks:1259,passed:1259}}}},perDocument:[
    {id:'pdf-01',sections:{positions:{rows:{expected:178,matched:178}},cash:{rows:{expected:24,matched:24}}}},
    {id:'pdf-04',sections:{positions:{rows:{expected:20,matched:0}},cash:{rows:{expected:0,matched:0}}}},
  ]}}));
  const retention=doc('.security-retention');
  assert.equal(retention.find('strong').text(),'178 / 198');
  assert.ok(retention.text().includes('20 security rows missing or ambiguous across 1 PDF'));
  assert.ok(retention.text().includes('Cash rows: 24 / 24'));
  assert.ok(doc('.pdf-quality').text().includes('Monetary fields: 1,259 / 1,259; omitted rows excluded'));
  assert.equal(doc('.pdf-quality a').attr('href'),'pdf-assessment.json');
});

test('news scope table is collapsed, source escaped and linked to the full assessment',()=>{
  const doc=load(renderIngestionReport({scope:{},jobs:[],newsAssessment:{summary:{newsDocuments:100,assessedArticles:98,unassessedArticles:2,acceptedModelMatches:40,unsupportedRecords:3,unadjudicatedArticleDisagreements:12},perScope:[{clientRef:'CLIENT<script>',scope:'portfolio-1',modelArticleIds:['a','b'],baselineArticleIds:['a'],unadjudicatedDisagreements:1}]}}));
  assert.equal(doc('.client-news details').attr('open'),undefined);
  const row=doc('.client-news tbody tr');
  assert.equal(row.find('th').text(),'CLIENT<script>');
  assert.deepEqual(row.find('td').map((_index,cell)=>doc(cell).text()).get(),['portfolio-1','2','1','1']);
  assert.ok(doc('.client-news').text().includes('98 / 100 articles assessed'));
  assert.ok(doc('.client-news').text().includes('must not be added'));
  assert.equal(doc('.client-news a').attr('href'),'model-client-news.json');
});

test('PDF coverage surfaces extra rows and the archived first-pass comparison',()=>{
  const doc=load(renderIngestionReport({scope:{},jobs:[],pdfFirstPass:{summary:{factualMetrics:{sourceFacts:{checks:6140,passed:5697}}}},pdfAssessment:{summary:{documents:10,withModelOutput:10,factualMetrics:{sourceFacts:{checks:6140,passed:5871},matchedFacts:{checks:5871,passed:5871},rows:{extra:54},unsupportedValues:0,schemaIssues:0}}}}));
  assert.ok(doc('.pdf-quality').text().includes('54 extra rows · 0 unsupported values · 0 schema issues'));
  assert.ok(doc('.pdf-first-pass').text().includes('5,697 / 6,140 → 5,871 / 6,140'));
  assert.ok(doc('.pdf-first-pass').text().includes('without adding source answers'));
  assert.equal(doc('.pdf-first-pass a').attr('href'),'pdf-first-pass-assessment.json');
});
