import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';

// Keys stay in memory. Use existing endpoints; this script provisions nothing.
const env={...loadEnv('development',process.cwd(),''),...process.env};
const provider=env.BENCHMARK_PROVIDER || 'azure';
if(!['azure','fireworks'].includes(provider))throw new Error('BENCHMARK_PROVIDER must be azure or fireworks.');
const endpoint=(provider==='fireworks' ? env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1' : env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/,'');
const apiBase=provider==='fireworks'?endpoint:endpoint.replace(/\/openai\/v1$/i,'')+'/openai/v1';
if(!endpoint)throw new Error('Set AZURE_OPENAI_ENDPOINT.');
const key=provider==='fireworks' ? env.FIREWORKS_API_KEY : env.AZURE_OPENAI_API_KEY || (env.AZURE_RESOURCE && env.AZURE_RESOURCE_GROUP
  ? execFileSync('az',['cognitiveservices','account','keys','list','-g',env.AZURE_RESOURCE_GROUP,'-n',env.AZURE_RESOURCE,'--query','key1','-o','tsv','--only-show-errors'],{encoding:'utf8'}).trim() : '');
if(!key)throw new Error('Configure the selected provider API key (or Azure CLI resource lookup).');
const headers:Record<string,string>=provider==='fireworks'?{Authorization:`Bearer ${key}`}:{'api-key':key};
const models=(env.BENCHMARK_MODELS || (provider==='fireworks'?'accounts/fireworks/models/qwen3p7-plus,accounts/fireworks/models/qwen3p8-max':'compass-gpt-5-mini,FW-MiniMax-M3,DeepSeek-V4-Flash')).split(',');
const effort=env.BENCHMARK_REASONING_EFFORT?.trim();
if(effort&&!['none','minimal','low','medium','high','xhigh','max','adaptive'].includes(effort))throw new Error('Unsupported benchmark reasoning effort.');
const repeats=Number(env.BENCHMARK_RUNS || 3);
const tokenCap=Number(env.BENCHMARK_MAX_TOKENS || 8192);
if(!Number.isInteger(tokenCap)||tokenCap<1)throw new Error('Use a positive integer token budget.');
if(!Number.isInteger(repeats)||repeats<1||repeats>10)throw new Error('Use 1–10 benchmark runs.');
const prompt='Write exactly 30 numbered bullet points describing features of a fictional wealth-adviser dashboard. Each bullet must contain 12 to 16 words. Cover client context, portfolio weights, evidence, news, missing data, and adviser review. Do not provide investment recommendations. Output only the numbered list, without a preamble.';
const rows:any[]=[];
async function run(model:string,round:number){
  const start=performance.now();let firstText:number|undefined,lastText:number|undefined,firstGenerated:number|undefined,lastGenerated:number|undefined,usage:any,text='',reasoningCharacters=0,finish:string|undefined;
  try {
    const response=await fetch(`${apiBase}/chat/completions`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({model,stream:true,stream_options:{include_usage:true},messages:[{role:'user',content:prompt}],...(model.includes('gpt-5-mini')?{reasoning_effort:'minimal',max_completion_tokens:tokenCap}:{max_tokens:tokenCap}),...(effort?{reasoning_effort:effort}:{})})});
    if(!response.ok)throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0,400)}`);
    if(!response.body)throw new Error('No stream');
    const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
    while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const lines=pending.split('\n');pending=lines.pop()!;
      for(const line of lines){if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')continue;
        const chunk=JSON.parse(raw),now=performance.now();if(chunk.usage)usage=chunk.usage;
        for(const choice of chunk.choices||[]){const delta=choice.delta||{},reasoning=delta.reasoning_content || delta.reasoning || '';
          if(delta.content||reasoning){firstGenerated??=now;lastGenerated=now;}
          if(delta.content){firstText??=now;lastText=now;text+=delta.content;}
          if(typeof reasoning==='string')reasoningCharacters+=reasoning.length;
          if(choice.finish_reason)finish=choice.finish_reason;
        }
      }
    }
    const totalSeconds=(performance.now()-start)/1000;
    const completion=usage?.completion_tokens,reasoning=usage?.completion_tokens_details?.reasoning_tokens;
    // Only calculate visible decoding TPS when reasoning-token accounting is explicit.
    const visible=typeof completion==='number' && typeof reasoning==='number' ? completion-reasoning : null;
    const row={model,round,effort:effort || (model.includes('gpt-5-mini')?'minimal':'provider default'),ttftSeconds:firstText?(firstText-start)/1000:null,totalSeconds,completionTokens:completion??null,reasoningTokens:reasoning??null,visibleTokens:visible,visibleDecodeTps:visible!=null&&lastText&&firstText&&lastText>firstText?visible/((lastText-firstText)/1000):null,reportedCompletionTps:completion&&lastGenerated&&firstGenerated&&lastGenerated>firstGenerated?completion/((lastGenerated-firstGenerated)/1000):null,endToEndCompletionTps:completion?completion/totalSeconds:null,reasoningCharacters,visibleCharacters:text.length,numberedItems:(text.match(/^\s*\d+[.)]\s/gm)||[]).length,finish};
    rows.push(row);console.log(JSON.stringify(row));
  }catch(error){const row={model,round,error:error instanceof Error?error.message:'Request failed'};rows.push(row);console.log(JSON.stringify(row));}
}
for(let round=1;round<=repeats;round++)await Promise.all(models.map(model=>run(model,round)));
const median=(values:number[])=>{values.sort((a,b)=>a-b);return values.length?values.length%2?values[Math.floor(values.length/2)]:(values[values.length/2-1]+values[values.length/2])/2:null;};
const summary=models.map(model=>{const successes=rows.filter(r=>r.model===model&&!r.error);return {model,completed:successes.filter(r=>r.finish==='stop'&&r.visibleCharacters>0).length,runs:repeats,...Object.fromEntries(['ttftSeconds','totalSeconds','visibleDecodeTps','reportedCompletionTps','endToEndCompletionTps'].map(k=>[k,median(successes.map(r=>r[k]).filter(v=>typeof v==='number'))]))};});
const report={at:new Date().toISOString(),provider,endpoint,effort:effort || 'model default',prompt,repeats,tokenCap,notes:['Same prompt, one request per model concurrently per round; caching and shared-service load are uncontrolled.','Client-observed streaming timings from this machine. Three samples do not establish an SLA or a reliable p95.','Reported completion TPS may include reasoning tokens and is not directly comparable across different tokenizers. Visible decoding TPS is withheld when reasoning usage is absent.','TTFT is first visible content; total includes the final usage chunk. This is a speed test, not a financial-quality evaluation.'],summary,rows};
await mkdir('test-results',{recursive:true});await writeFile(`test-results/llm-benchmark${provider==='fireworks'?'-fireworks':''}${effort?'-'+effort:''}.json`,JSON.stringify(report,null,2));console.log('MEDIANS '+JSON.stringify(summary));
