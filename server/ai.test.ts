import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfigured, aiLabel, selectJson } from './ai';

const schema={type:'object',properties:{ids:{type:'array',items:{type:'string'}}},required:['ids'],additionalProperties:false};

test('provider configuration is explicit and labels the selected runtime', () => {
  assert.equal(aiConfigured({}), false);
  assert.equal(aiConfigured({AI_PROVIDER:'azure',AZURE_OPENAI_ENDPOINT:'https://example.openai.azure.com',AZURE_OPENAI_API_KEY:'key',AZURE_OPENAI_DEPLOYMENT:'gpt-5-mini'}), true);
  assert.equal(aiConfigured({AI_PROVIDER:'fireworks',FIREWORKS_API_KEY:'key'}), true);
  assert.equal(aiConfigured({AI_PROVIDER:'azure',OPENAI_API_KEY:'ignored'}), false);
  assert.equal(aiLabel({AI_PROVIDER:'azure'}), 'Azure AI');
  assert.equal(aiLabel({AI_PROVIDER:'fireworks'}), 'Fireworks');
});

test('Fireworks uses its OpenAI-compatible endpoint and structured JSON output', async () => {
  const original=globalThis.fetch; let request: Request | undefined;
  globalThis.fetch=async (input,init)=>{ request=new Request(String(input),init); return new Response(JSON.stringify({choices:[{message:{content:'{"ids":["health"]}'}}]}),{status:200}); };
  try {
    const result=await selectJson('Choose evidence.',{facts:['health']},schema,'selection',{AI_PROVIDER:'fireworks',FIREWORKS_API_KEY:'fireworks-key'});
    assert.deepEqual(result,{ids:['health']});
    assert.equal(request?.url,'https://api.fireworks.ai/inference/v1/chat/completions');
    assert.match(request?.headers.get('authorization') || '',/Bearer fireworks-key/);
    const sent=await request!.json();assert.equal(sent.model,'accounts/fireworks/models/qwen3-8b');assert.deepEqual(sent.response_format.json_schema.schema,schema);
  } finally { globalThis.fetch=original; }
});

test('Azure AI uses the v1 Responses endpoint and api-key header', async () => {
  const original=globalThis.fetch; let request: Request | undefined;
  globalThis.fetch=async (input,init)=>{ request=new Request(String(input),init); return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'{"ids":["health"]}'}]}]}),{status:200}); };
  try {
    const result=await selectJson('Choose evidence.',{facts:['health']},schema,'selection',{AI_PROVIDER:'azure',AZURE_OPENAI_ENDPOINT:'https://example.openai.azure.com/openai/v1/',AZURE_OPENAI_API_KEY:'azure-key',AZURE_OPENAI_DEPLOYMENT:'compass-mini',AZURE_OPENAI_REASONING_EFFORT:'minimal'});
    assert.deepEqual(result,{ids:['health']});
    assert.equal(request?.url,'https://example.openai.azure.com/openai/v1/responses');
    assert.equal(request?.headers.get('api-key'),'azure-key');
    const sent=await request!.json();assert.equal(sent.model,'compass-mini');assert.deepEqual(sent.reasoning,{effort:'minimal'});
  } finally { globalThis.fetch=original; }
});

test('direct Fireworks supports disabling thinking without changing structured output',async()=>{
  const original=globalThis.fetch;let sent:any;
  globalThis.fetch=async(_input,init)=>{sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:'{"ids":["health"]}'}}]}));};
  try{
    await selectJson('Select IDs',{},schema,'selection',{AI_PROVIDER:'fireworks',FIREWORKS_API_KEY:'test',FIREWORKS_MODEL:'accounts/fireworks/models/qwen3p8-max',FIREWORKS_REASONING_EFFORT:'none'});
    assert.equal(sent.reasoning_effort,'none');assert.equal(sent.max_tokens,600);assert.deepEqual(sent.response_format.json_schema.schema,schema);
  }finally{globalThis.fetch=original;}
});

test('Azure Fireworks chat sends the deployed model and omits unsupported reasoning controls by default',async()=>{
  const original=globalThis.fetch;let sent:any;
  globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://example.cognitiveservices.azure.com/openai/v1/chat/completions');sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:'{"ids":["health"]}'}}]}));};
  try{
    assert.deepEqual(await selectJson('Select IDs',{},schema,'selection',{AI_PROVIDER:'azure',AZURE_OPENAI_ENDPOINT:'https://example.cognitiveservices.azure.com/',AZURE_OPENAI_API:'chat',AZURE_OPENAI_API_KEY:'test',AZURE_OPENAI_DEPLOYMENT:'FW-MiniMax-M3'}),{ids:['health']});
    assert.equal(sent.model,'FW-MiniMax-M3');assert.equal(sent.reasoning_effort,undefined);assert.equal(sent.temperature,undefined);assert.deepEqual(sent.response_format.json_schema.schema,schema);
  }finally{globalThis.fetch=original;}
});
