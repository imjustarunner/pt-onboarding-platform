import crypto from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { parseGoogleWorkspaceServiceAccountFromEnv } from './googleWorkspaceAuth.service.js';

const DEFAULT_VERTEX_EMBEDDING_MODEL = 'text-embedding-005';
const DEFAULT_API_EMBEDDING_MODEL = 'text-embedding-004';

async function getAccessToken() {
  const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
  const authSource = String(process.env.VERTEX_AUTH_SOURCE || '').trim().toLowerCase();
  const workspaceSa =
    authSource === 'workspace_service_account' ? parseGoogleWorkspaceServiceAccountFromEnv() : null;
  const auth = workspaceSa ? new GoogleAuth({ credentials: workspaceSa, scopes }) : new GoogleAuth({ scopes });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!token) {
    const err = new Error('Failed to acquire Google Cloud access token');
    err.status = 503;
    throw err;
  }
  return token;
}

function getProjectId() {
  return process.env.GCP_PROJECT_ID || process.env.GCS_PROJECT_ID || process.env.PROJECT_ID || '';
}

function shouldUseVertex() {
  const forceApiKey = String(process.env.GEMINI_FORCE_API_KEY || '').trim().toLowerCase() === 'true';
  if (forceApiKey) return false;
  return Boolean(getProjectId());
}

function extractEmbeddingValues(data) {
  const prediction = data?.predictions?.[0];
  if (prediction?.embeddings?.values) return prediction.embeddings.values;
  if (Array.isArray(prediction?.embeddings) && prediction.embeddings[0]?.values) {
    return prediction.embeddings[0].values;
  }
  if (data?.embedding?.values) return data.embedding.values;
  return null;
}

async function embedViaVertex({ text, taskType = 'RETRIEVAL_DOCUMENT' }) {
  const projectId = getProjectId();
  const location = String(process.env.VERTEX_AI_LOCATION || 'us-central1').trim() || 'us-central1';
  const modelName = String(process.env.VERTEX_EMBEDDING_MODEL || DEFAULT_VERTEX_EMBEDDING_MODEL).trim()
    || DEFAULT_VERTEX_EMBEDDING_MODEL;
  const token = await getAccessToken();
  const url = `https://${encodeURIComponent(location)}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelName)}:predict`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      instances: [
        {
          content: String(text || '').trim(),
          task_type: taskType
        }
      ]
    })
  });

  if (!resp.ok) {
    const details = String(await resp.text()).slice(0, 1000);
    const err = new Error('Vertex embedding request failed');
    err.status = resp.status;
    err.details = details;
    throw err;
  }

  const data = await resp.json();
  const values = extractEmbeddingValues(data);
  if (!Array.isArray(values) || !values.length) {
    const err = new Error('Vertex embedding returned empty vector');
    err.status = 502;
    throw err;
  }
  return { values, modelName, provider: 'vertex' };
}

async function embedViaApiKey({ text }) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }
  const modelName = String(process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_API_EMBEDDING_MODEL).trim()
    || DEFAULT_API_EMBEDDING_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:embedContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      model: `models/${modelName}`,
      content: { parts: [{ text: String(text || '').trim() }] }
    })
  });

  if (!resp.ok) {
    const details = String(await resp.text()).slice(0, 1000);
    const err = new Error('Gemini embedding request failed');
    err.status = resp.status;
    err.details = details;
    throw err;
  }

  const data = await resp.json();
  const values = extractEmbeddingValues(data);
  if (!Array.isArray(values) || !values.length) {
    const err = new Error('Gemini embedding returned empty vector');
    err.status = 502;
    throw err;
  }
  return { values, modelName, provider: 'api_key' };
}

export function hashEmbeddingContent(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

/**
 * Embed text for retrieval. Uses Vertex when configured, else GEMINI_API_KEY.
 * taskType: RETRIEVAL_DOCUMENT | RETRIEVAL_QUERY (Vertex only; ignored on API key path).
 */
export async function embedTextForRetrieval(text, { taskType = 'RETRIEVAL_DOCUMENT' } = {}) {
  const content = String(text || '').trim();
  if (!content) {
    const err = new Error('Text is required for embedding');
    err.status = 400;
    throw err;
  }

  const useVertex = shouldUseVertex();
  const hasApiKey = !!String(process.env.GEMINI_API_KEY || '').trim();

  if (useVertex) {
    try {
      return await embedViaVertex({ text: content, taskType });
    } catch (vertexErr) {
      if (hasApiKey) {
        console.warn(
          `[Embedding] Vertex unavailable (${vertexErr?.status || 'error'}: ${vertexErr?.message}); falling back to GEMINI_API_KEY`
        );
        return embedViaApiKey({ text: content });
      }
      throw vertexErr;
    }
  }

  if (hasApiKey) return embedViaApiKey({ text: content });

  const err = new Error('No embedding provider configured (GCP project or GEMINI_API_KEY required)');
  err.status = 503;
  throw err;
}

export async function embedQueryForRetrieval(text) {
  return embedTextForRetrieval(text, { taskType: 'RETRIEVAL_QUERY' });
}

export async function embedDocumentForRetrieval(text) {
  return embedTextForRetrieval(text, { taskType: 'RETRIEVAL_DOCUMENT' });
}
