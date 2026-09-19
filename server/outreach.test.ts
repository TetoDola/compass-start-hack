import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutreachClassifier, validateClassification, validateOutreachRequest } from './outreach';
import type { ClassificationInput } from '../src/lib/outreach';

const input: ClassificationInput = { article: { id: 'a', title: 'Acme Corp files for bankruptcy', summary: 'Deadline: 2026-09-20.', url: 'https://example.com/a', source: 'Example', publishedAt: new Date().toISOString(), layer: 'news', sources: [] }, targets: [{ id: 'acme', name: 'Acme Corp', weight: null, via: 'public' }] };
const valid = { articleId: 'a', type: 'distress', status: 'reported', evidence: input.article.title, matches: [{ targetId: 'acme', evidence: input.article.title }], eventDate: null, eventDateEvidence: null, timing: 'none', timingEvidence: null, deadline: null };
test('classifier requires exact evidence, allowed identities, explicit dates and complete fields', () => {
  assert.equal(validateClassification(valid, input).mode, 'minimax');
  for (const bad of [
    { ...valid, evidence: 'Invented event' }, { ...valid, matches: [{ targetId: 'other', evidence: input.article.title }] },
    { ...valid, matches: [...valid.matches, ...valid.matches] }, { ...valid, eventDate: '2026-09-19', eventDateEvidence: input.article.title },
    { ...valid, timing: 'deadline', timingEvidence: input.article.summary, deadline: '2026-09-21' }, { ...valid, timing: 'ongoing', timingEvidence: null },
    { ...valid, type: 'toString' }, { ...valid, eventDate: undefined },
  ]) assert.throws(() => validateClassification(bad, input));
});
test('API rejects old articles and projects only public fields, ignoring supplied portfolio data', () => {
  assert.throws(() => validateOutreachRequest([{ ...input, article: { ...input.article, publishedAt: '2000-01-01' } }]));
  assert.throws(() => validateOutreachRequest(Array(7).fill(input)));
  const [clean] = validateOutreachRequest([{ ...input, clientName: 'PRIVATE CLIENT', article: { ...input.article, secret: 'PRIVATE NOTE' }, targets: [{ ...input.targets[0], weight: .9, classificationEvidence: [{ title: 'PRIVATE HOLDING' }] }] }]);
  assert.ok(!JSON.stringify(clean).includes('PRIVATE'));
  assert.equal(clean.targets[0].weight, null);
});
test('MiniMax deployment is isolated, content cached and invalid output falls back conservatively', async () => {
  let calls = 0;
  const classifier = createOutreachClassifier({ AZURE_OPENAI_ENDPOINT: 'https://example.test', AZURE_OPENAI_API_KEY: 'test', AI_PROVIDER: 'codex' }, async (_instructions, _input, _schema, _name, config) => {
    calls++; assert.equal(config.AI_PROVIDER, 'azure'); assert.equal(config.AZURE_OPENAI_DEPLOYMENT, 'FW-MiniMax-M3');
    return { results: [valid] };
  });
  const [a, b] = await Promise.all([classifier([input]), classifier([input])]);
  assert.equal(calls, 1); assert.equal(a[0].mode, 'minimax'); assert.deepEqual(a, b);
  const bad = createOutreachClassifier({ AZURE_OPENAI_ENDPOINT: 'https://example.test', AZURE_OPENAI_API_KEY: 'test' }, async () => ({ results: [{ ...valid, evidence: 'invented' }] }));
  assert.equal((await bad([input]))[0].mode, 'rules');
  const unconfigured = createOutreachClassifier({});
  assert.equal((await unconfigured([input]))[0].mode, 'rules');
});
