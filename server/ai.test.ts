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
  globalThis.fetch=async input=>{ request=new Request(String(input),{method:'POST',headers:{Authorization:'Bearer fireworks-key'},body:JSON.stringify({model:'accounts/fireworks/models/qwen3-8b',response_format:{type:'json_schema',json_schema:{name:'selection',schema}}})}); return new Response(JSON.stringify({choices:[{message:{content:'{"ids":["health"]}'}}]}),{status:200}); };
  try {
    const result=await selectJson('Choose evidence.',{facts:['health']},schema,'selection',{AI_PROVIDER:'fireworks',FIREWORKS_API_KEY:'fireworks-key'});
    assert.deepEqual(result,{ids:['health']});
    assert.equal(request?.url,'https://api.fireworks.ai/inference/v1/chat/completions');
    assert.match(request?.headers.get('authorization') || '',/Bearer fireworks-key/);
  } finally { globalThis.fetch=original; }
});

test('Azure AI uses the v1 Responses endpoint and api-key header', async () => {
  const original=globalThis.fetch; let request: Request | undefined;
  globalThis.fetch=async input=>{ request=new Request(String(input),{method:'POST',headers:{'api-key':'azure-key'},body:JSON.stringify({model:'compass-mini'})}); return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'{"ids":["health"]}'}]}]}),{status:200}); };
  try {
    const result=await selectJson('Choose evidence.',{facts:['health']},schema,'selection',{AI_PROVIDER:'azure',AZURE_OPENAI_ENDPOINT:'https://example.openai.azure.com',AZURE_OPENAI_API_KEY:'azure-key',AZURE_OPENAI_DEPLOYMENT:'compass-mini'});
    assert.deepEqual(result,{ids:['health']});
    assert.equal(request?.url,'https://example.openai.azure.com/openai/v1/responses');
    assert.equal(request?.headers.get('api-key'),'azure-key');
  } finally { globalThis.fetch=original; }
});
