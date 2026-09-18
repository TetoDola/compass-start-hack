import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAdvisorAnswer } from './advisor';
const input={question:'What is wrong?',previousQuestions:[],candidates:[{id:'attention',title:'Review',text:['Recorded finding']}],fallback:['attention']};
test('advisor works without keys and rejects an invented AI answer ID',async()=>{
  assert.deepEqual((await selectAdvisorAnswer(input,{})).ids,['attention']);
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({ids:['invented']})}]}]}),{status:200});
  try{const result=await selectAdvisorAnswer(input,{OPENAI_API_KEY:'test'});assert.deepEqual(result.ids,['attention']);assert.match(result.mode,/unavailable/);}finally{globalThis.fetch=original;}
});
