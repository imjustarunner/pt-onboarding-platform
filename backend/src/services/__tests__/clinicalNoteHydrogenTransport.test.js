import { it } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuth } from 'google-auth-library';
import { callGeminiText } from '../geminiText.service.js';
import { clinicalWriterOptions } from '../clinicalNoteWriter.service.js';
import { getNoteAidToolById } from '../../config/noteAidTools.js';

function mockTransport(t, { status = 200, parts = [{ text: 'Synthetic note' }] } = {}) {
  for (const [key, value] of Object.entries({ GCP_PROJECT_ID: 'synthetic-test', GEMINI_FORCE_API_KEY: 'false', VERTEX_AUTH_SOURCE: '', VERTEX_AI_LOCATION: 'us-central1', GEMINI_API_KEY: 'synthetic-key-never-sent', CLINICAL_NOTE_MODEL: '', CLINICAL_NOTE_VERTEX_LOCATION: '' })) {
    const original = process.env[key];
    process.env[key] = value;
    t.after(() => { if (original == null) delete process.env[key]; else process.env[key] = original; });
  }
  t.mock.method(GoogleAuth.prototype, 'getClient', async () => ({ getAccessToken: async () => 'synthetic-token' }));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(status === 200 ? JSON.stringify({ candidates: [{ content: { parts }, finishReason: 'STOP' }] }) : 'Synthetic model denied', { status });
  });
  return calls;
}

it('sends clinical notes to Hydrogen in the US with supported parameters and excludes thought text', async (t) => {
  const calls = mockTransport(t, { parts: [{ text: 'Internal reasoning', thought: true }, { text: 'Subjective: Synthetic note' }] });
  const response = await callGeminiText({ ...clinicalWriterOptions(getNoteAidToolById('clinical_psychotherapy_note')), prompt: 'Synthetic facts', vertexOnly: true, sensitive: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/aiplatform\.us\.rep\.googleapis\.com\/v1\/projects\/synthetic-test\/locations\/us\/publishers\/google\/models\/gemini-4-hydrogen:generateContent$/);
  assert.equal(calls[0].body.model, 'projects/synthetic-test/locations/us/publishers/google/models/gemini-4-hydrogen');
  assert.deepEqual(calls[0].body.generationConfig, { maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'MEDIUM' } });
  assert.equal(response.modelName, 'gemini-4-hydrogen');
  assert.equal(response.provider, 'vertex');
  assert.equal(response.text, 'Subjective: Synthetic note');
});

it('fails without switching to an old model or the API-key provider when Hydrogen is denied', async (t) => {
  const calls = mockTransport(t, { status: 403 });
  await assert.rejects(callGeminiText({ ...clinicalWriterOptions(getNoteAidToolById('clinical_psychotherapy_note')), prompt: 'Synthetic facts', vertexOnly: true, sensitive: true }), { status: 403 });
  assert.equal(calls.length, 1);
});

it('does not expose a thought-only response as a clinical note', async (t) => {
  mockTransport(t, { parts: [{ text: 'Internal reasoning only', thought: true }] });
  await assert.rejects(callGeminiText({ prompt: 'Synthetic facts', model: 'gemini-4-hydrogen', vertexLocation: 'us', vertexOnly: true, sensitive: true, allowModelFallback: false }), { status: 502 });
});

for (const [location, host] of [['global', 'aiplatform.googleapis.com'], ['eu', 'aiplatform.eu.rep.googleapis.com'], ['us-central1', 'us-central1-aiplatform.googleapis.com']]) {
  it(`uses the documented ${location} endpoint when explicitly configured`, async (t) => {
    const calls = mockTransport(t);
    await callGeminiText({ prompt: 'Synthetic facts', model: 'gemini-4-hydrogen', vertexLocation: location, vertexOnly: true, allowModelFallback: false, jsonMode: true });
    assert.equal(new URL(calls[0].url).hostname, host);
    assert.equal(calls[0].body.generationConfig.responseMimeType, 'application/json');
  });
}

it('preserves the regional endpoint and Flash settings for unrelated AI features', async (t) => {
  const calls = mockTransport(t);
  await callGeminiText({ prompt: 'Synthetic translation', model: 'gemini-2.5-flash', maxOutputTokens: 800, thinkingBudget: 0 });
  assert.equal(new URL(calls[0].url).hostname, 'us-central1-aiplatform.googleapis.com');
  assert.deepEqual(calls[0].body.generationConfig, { temperature: 0.2, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } });
});
