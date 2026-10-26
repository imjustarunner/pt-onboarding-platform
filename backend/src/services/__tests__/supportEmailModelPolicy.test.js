import { it } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuth } from 'google-auth-library';
import { callGeminiText } from '../geminiText.service.js';

function mockVertex(t) {
  for (const [key, value] of Object.entries({ GCP_PROJECT_ID: 'synthetic-test', GEMINI_FORCE_API_KEY: 'false', VERTEX_AUTH_SOURCE: '', GEMINI_API_KEY: 'synthetic-key-never-sent' })) {
    const original = process.env[key];
    process.env[key] = value;
    t.after(() => { if (original == null) delete process.env[key]; else process.env[key] = original; });
  }
  t.mock.method(GoogleAuth.prototype, 'getClient', async () => ({ getAccessToken: async () => 'synthetic-token' }));
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    return String(url).includes('gemini-2.5-pro')
      ? new Response('Synthetic model denied', { status: 403 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Synthetic fallback result' }] } }] }), { status: 200 });
  });
  return urls;
}

it('support drafts fail closed if the tested Vertex model is unavailable', async (t) => {
  const urls = mockVertex(t);
  await assert.rejects(callGeminiText({ prompt: 'Synthetic test only', model: 'gemini-2.5-pro', vertexOnly: true, sensitive: true, allowModelFallback: false }), (error) => error.status === 403);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /aiplatform\.googleapis\.com.*gemini-2\.5-pro/);
});

it('existing callers retain their default Vertex model fallback', async (t) => {
  const urls = mockVertex(t);
  const response = await callGeminiText({ prompt: 'Synthetic test only', model: 'gemini-2.5-pro', vertexOnly: true, sensitive: true });
  assert.equal(urls.length, 2);
  assert.match(urls[1], /aiplatform\.googleapis\.com.*gemini-2\.5-flash/);
  assert.equal(response.text, 'Synthetic fallback result');
});
