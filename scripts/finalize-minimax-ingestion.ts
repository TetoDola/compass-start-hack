import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assessPdfJobs } from './assess-pdf-ingestion.ts';
import { assessNewsJobs } from './assess-news-ingestion.ts';
import { summarizeRun } from './reingestion-quality.ts';
import { renderIngestionReport } from './render-ingestion-report.ts';

const out=resolve(process.env.INGESTION_OUTPUT||'test-results/minimax-reingestion');
const read=async(name:string)=>JSON.parse(await readFile(resolve(out,name),'utf8'));
const run=await read('run.json'),context=await read('context-manifest.json'),raw=await read('ingestion-context.raw.json');
let jobs=await Promise.all((await readdir(resolve(out,'jobs'))).filter(f=>f.endsWith('.json')).sort().map(f=>read(`jobs/${f}`)));
// The job directory holds only this frozen corpus. Prior prompts are kept in separate archives.
const manifest=await read('source-manifest.json');const planned=new Map(manifest.jobs.map((j:any)=>[j.id,j]));
try{const supplemental=await read('supplemental-source-manifest.json');for(const j of supplemental.jobs)planned.set(j.id,j);}catch{}
jobs=jobs.filter(j=>planned.has(j.id));
for(const job of jobs){const plannedJob:any=planned.get(job.id);if(plannedJob.sourceHash!==job.sourceHash)throw new Error(`Source hash changed for ${job.id}; rerun ingestion before finalizing.`);}
const missing=[...planned.keys()].filter(id=>!jobs.some(j=>j.id===id));if(missing.length)throw new Error(`Ingestion is incomplete: ${missing.length} planned jobs missing.`);
run.jobs=jobs;run.scope.selectedJobs=run.scope.plannedJobs=planned.size;run.completedAt=new Date().toISOString();
try{run.scope.researchLibrary=await read('browser-research-observation.json');}catch{}
run.pdfAssessment=assessPdfJobs(jobs);run.newsAssessment=assessNewsJobs(jobs,context,raw);
try{run.pdfFirstPass=await read('pdf-first-pass-assessment.json');}catch{}
run.methodology={...run.methodology,pdfRefinement:'Same 10 source reports and model, clarified general definitions for cost quotes, cash separation, chart dimension/scope and annual net-flow column. No source answers added to prompts. First-pass outputs and assessment retained.',sourceReplay:'App-safe client projection plus original transactions/rule overrides, complete master/reference tables and fund rows, available snapshots and source context. Contact/account identifiers excluded.',sampling:'One response per job; this is a local corpus test, not a repeatability estimate or provider SLA.'};
run.summary=summarizeRun(run);
const sourceKinds=new Set(['clients','securities','reference','fund-mappings','fund-holdings','pdf','news-world','world-provenance']);
const source=jobs.filter(j=>sourceKinds.has(j.kind)&&j.metrics);
run.summary.sourceChecks=source.reduce((n,j)=>n+j.metrics.checks,0);run.summary.sourcePassed=source.reduce((n,j)=>n+j.metrics.passed,0);
run.summary.sourceAgreement=run.summary.sourceChecks?run.summary.sourcePassed/run.summary.sourceChecks:null;
const prior=[];
for(const dir of ['pdf-first-pass','pilot-initial','attempts'])try{for(const file of await readdir(resolve(out,dir)))if(file.endsWith('.json'))prior.push(await read(`${dir}/${file}`));}catch{}
run.retryHistory={failedCallsRetried:prior.filter(j=>j.state==='failed').length,retainedIn:'attempts/',note:'Rejected or incomplete calls are retained separately from final accepted responses.'};
run.usageIncludingPilots={promptTokens:[...jobs,...prior].reduce((n,j)=>n+(j.usage?.prompt_tokens||0),0),completionTokens:[...jobs,...prior].reduce((n,j)=>n+(j.usage?.completion_tokens||0),0),note:'Provider-reported counters from final jobs plus archived PDF passes. Incomplete calls may have unreported usage; Azure billing remains authoritative.'};
await writeFile(resolve(out,'run.json'),JSON.stringify(run,null,2));
await writeFile(resolve(out,'pdf-assessment.json'),JSON.stringify(run.pdfAssessment,null,2));
await writeFile(resolve(out,'model-client-news.json'),JSON.stringify(run.newsAssessment,null,2));
await writeFile(resolve(out,'model-output.json'),JSON.stringify({model:run.model,at:run.completedAt,records:jobs.map(({id,kind,state,actual,source,sourceHash})=>({id,kind,state,source,sourceHash,data:actual}))},null,2));
await writeFile(resolve(out,'report.html'),renderIngestionReport(run));
console.log(JSON.stringify({report:resolve(out,'report.html'),summary:run.summary,pdf:run.pdfAssessment.summary,news:run.newsAssessment.summary,usage:run.usageIncludingPilots}));
