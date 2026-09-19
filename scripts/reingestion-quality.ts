/** Independent checks compare model extraction to source facts, never to model self-ratings. */
export function schemaFor(value:any):any {return mergedSchema([value]);}
function mergedSchema(values:any[]):any {
 const present=values.filter(v=>v!==undefined&&v!==null),nullable=present.length<values.length;
 const types=[...new Set(present.map(v=>Array.isArray(v)?'array':typeof v))];
 if(!types.length)return {type:'null'};
 if(types.length>1)return {anyOf:[...types.map(t=>mergedSchema(present.filter(v=>(Array.isArray(v)?'array':typeof v)===t))),...(nullable?[{type:'null'}]:[])]};
 const type=types[0];const schema:any={type:nullable?[type,'null']:type};
 if(type==='object'){const keys=[...new Set(present.flatMap(v=>Object.keys(v)))];schema.properties=Object.fromEntries(keys.map(k=>[k,mergedSchema(present.map(v=>v[k]))]));schema.required=keys;schema.additionalProperties=false;}
 if(type==='array'){const entries=present.flat();schema.items=entries.length?mergedSchema(entries):{type:'string'};}
 return schema;
}
export function normalizeForSchema(value:any,schema:any):any {
 if(value==null)return null;
 if(schema.anyOf){const type=Array.isArray(value)?'array':typeof value;return normalizeForSchema(value,schema.anyOf.find((s:any)=>s.type===type||Array.isArray(s.type)&&s.type.includes(type))||schema.anyOf[0]);}
 if(Array.isArray(value))return value.map(v=>normalizeForSchema(v,schema.items));
 if(typeof value==='object')return Object.fromEntries(Object.entries(schema.properties||{}).map(([k,s])=>[k,normalizeForSchema(value[k],s)]));
 return value;
}
export function compareSource(expected:any,actual:any){
 let checks=0,passed=0;const issues:string[]=[];
 const view=(v:any)=>{const s=JSON.stringify(v);return s===undefined?'missing':s.length>180?s.slice(0,177)+'...':s;};
 function check(ok:boolean,path:string,want:any,got:any){checks++;if(ok)passed++;else if(issues.length<200)issues.push(`${path}: expected ${view(want)}; received ${view(got)}`);}
 function visit(e:any,a:any,path:string){
  if(Array.isArray(e)){check(Array.isArray(a)&&a.length===e.length,`${path}.length`,e.length,Array.isArray(a)?a.length:a);for(let i=0;i<e.length;i++)visit(e[i],Array.isArray(a)?a[i]:undefined,`${path}[${i}]`);return;}
  if(e!==null&&typeof e==='object'){for(const key of Object.keys(e))visit(e[key],a?.[key],`${path}.${key}`);if(a&&typeof a==='object'&&!Array.isArray(a))for(const key of Object.keys(a))if(!Object.hasOwn(e,key))check(false,`${path}.${key}`,'no additional field',a[key]);return;}
  check(typeof e==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-e)<=1e-6:Object.is(e,a),path,e,a);
 }
 visit(expected,actual,'data');return {checks,passed,issues};
}
export function summarizeRun(run:any){const jobs=run.jobs||[];const allMeasured=jobs.filter((j:any)=>j.metrics);const measured=allMeasured.filter((j:any)=>!['news-entities','news-labeled-quality'].includes(j.kind));const checks=measured.reduce((n:number,j:any)=>n+j.metrics.checks,0),passed=measured.reduce((n:number,j:any)=>n+j.metrics.passed,0);const byKind:any={};for(const j of jobs){const s=byKind[j.kind]||={jobs:0,passed:0,review:0,failed:0,checks:0,matched:0};s.jobs++;s[j.state]++;s.checks+=j.metrics?.checks||0;s.matched+=j.metrics?.passed||0;}return {completedJobs:jobs.length,plannedJobs:run.scope.selectedJobs||run.scope.plannedJobs,passedJobs:jobs.filter((j:any)=>j.state==='passed').length,reviewJobs:jobs.filter((j:any)=>j.state==='review').length,failedJobs:jobs.filter((j:any)=>j.state==='failed').length,checks,passed,allValidationChecks:allMeasured.reduce((n:number,j:any)=>n+j.metrics.checks,0),allValidationPassed:allMeasured.reduce((n:number,j:any)=>n+j.metrics.passed,0),sourceAgreement:checks?passed/checks:null,promptTokens:jobs.reduce((n:number,j:any)=>n+(j.usage?.prompt_tokens||0),0),completionTokens:jobs.reduce((n:number,j:any)=>n+(j.usage?.completion_tokens||0),0),byKind};}
