import { GoogleAuth } from 'google-auth-library';
import { parseGoogleWorkspaceServiceAccountFromEnv } from './googleWorkspaceAuth.service.js';

async function getAccessToken() {
  const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
  const authSource = String(process.env.VERTEX_AUTH_SOURCE || '').trim().toLowerCase(); // 'workspace_service_account' | ''
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
  return (
    process.env.GCP_PROJECT_ID ||
    process.env.GCS_PROJECT_ID ||
    process.env.PROJECT_ID ||
    ''
  );
}

function shouldUseVertex() {
  const forceApiKey = String(process.env.GEMINI_FORCE_API_KEY || '').trim().toLowerCase() === 'true';
  if (forceApiKey) return false;
  return Boolean(getProjectId());
}

export async function callGeminiText({ prompt, temperature = 0.2, maxOutputTokens = 800 }) {
  const useVertex = shouldUseVertex();

  if (useVertex) {
    const projectId = getProjectId();
    const location = String(process.env.VERTEX_AI_LOCATION || 'us-central1').trim() || 'us-central1';
    const modelName = String(process.env.GEMINI_MODEL || process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash').trim() ||
      'gemini-2.0-flash';
    const token = await getAccessToken();

    const url = `https://${encodeURIComponent(location)}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelName)}:generateContent`;

    const started = Date.now();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
        model: `projects/${projectId}/locations/${location}/publishers/google/models/${modelName}`,
        generationConfig: { temperature, maxOutputTokens }
      })
    });

    const latencyMs = Date.now() - started;

    if (!resp.ok) {
      const t = await resp.text();
      const err = new Error('Vertex Gemini request failed');
      err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      err.details = String(t || '').slice(0, 1000);
      err.latencyMs = latencyMs;
      throw err;
    }

    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text =
      Array.isArray(parts) ? parts.map((p) => p?.text || '').filter(Boolean).join('') : parts?.text || '';

    if (!text) {
      const err = new Error('Vertex Gemini returned empty response');
      err.status = 502;
      err.latencyMs = latencyMs;
      throw err;
    }

    return { text: String(text), modelName, latencyMs, provider: 'vertex' };
  }

  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const modelName = String(process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim() || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const started = Date.now();
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
      generationConfig: {
        temperature,
        maxOutputTokens
      }
    })
  });

  const latencyMs = Date.now() - started;

  if (!resp.ok) {
    const t = await resp.text();
    const err = new Error('Gemini request failed');
    err.status = 502;
    err.details = String(t || '').slice(0, 1000);
    err.latencyMs = latencyMs;
    throw err;
  }

  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text =
    Array.isArray(parts) ? parts.map((p) => p?.text || '').filter(Boolean).join('') : parts?.text || '';

  if (!text) {
    const err = new Error('Gemini returned empty response');
    err.status = 502;
    err.latencyMs = latencyMs;
    throw err;
  }

  return { text: String(text), modelName, latencyMs, provider: 'api_key' };
}
