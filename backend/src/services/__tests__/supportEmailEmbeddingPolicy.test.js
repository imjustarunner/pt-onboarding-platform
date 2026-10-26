import { it } from 'node:test';
import assert from 'node:assert/strict';
import { embedQueryForRetrieval } from '../geminiEmbedding.service.js';

it('support retrieval cannot fall back to a public API key for sensitive correspondence', async (t) => {
  const previous = process.env.GEMINI_FORCE_API_KEY;
  process.env.GEMINI_FORCE_API_KEY = 'true';
  t.after(() => { if (previous == null) delete process.env.GEMINI_FORCE_API_KEY; else process.env.GEMINI_FORCE_API_KEY = previous; });
  await assert.rejects(embedQueryForRetrieval('Synthetic test query only', { vertexOnly: true, sensitive: true }), /approved Vertex configuration/);
});
