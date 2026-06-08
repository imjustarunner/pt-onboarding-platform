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

// Known-good current models. Google has deprecated older aliases (gemini-pro,
// gemini-1.5-*), so when a configured model name is rejected we retry with these
// before giving up. This keeps shared callers (translation, agents, etc.) working
// even if an env var still points at a sunset model.
const VERTEX_FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash'];

// HTTP statuses that indicate the *model* (not the request) is the problem, so a
// retry with a different model name is worth attempting.
function isModelLevelError(status) {
  return status === 400 || status === 403 || status === 404;
}

function buildCandidateModels(configured) {
  const list = [];
  const add = (m) => {
    const name = String(m || '').trim();
    if (name && !list.includes(name)) list.push(name);
  };
  add(configured);
  VERTEX_FALLBACK_MODELS.forEach(add);
  return list;
}

async function performVertexCall({ modelName, projectId, location, token, prompt, temperature, maxOutputTokens }) {
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
    const details = String(t || '').slice(0, 1000);
    console.error(`[Vertex] HTTP ${resp.status} latency=${latencyMs}ms model=${modelName} details=${details}`);
    const err = new Error('Vertex Gemini request failed');
    err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
    err.details = details;
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

async function performApiKeyCall({ modelName, apiKey, prompt, temperature, maxOutputTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const started = Date.now();
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
      generationConfig: { temperature, maxOutputTokens }
    })
  });

  const latencyMs = Date.now() - started;

  if (!resp.ok) {
    const t = await resp.text();
    const details = String(t || '').slice(0, 1000);
    console.error(`[Gemini] HTTP ${resp.status} latency=${latencyMs}ms model=${modelName} details=${details}`);
    const err = new Error('Gemini request failed');
    err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
    err.details = details;
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

/**
 * Attempt the public Generative Language API (GEMINI_API_KEY) path, trying the
 * configured model then known-good fallbacks. Returns a result or throws.
 */
async function callViaApiKey({ prompt, temperature, maxOutputTokens }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }
  const configuredModel = String(process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim() || 'gemini-2.0-flash';
  const candidates = buildCandidateModels(configuredModel);
  let lastErr = null;
  for (const modelName of candidates) {
    try {
      return await performApiKeyCall({ modelName, apiKey, prompt, temperature, maxOutputTokens });
    } catch (err) {
      lastErr = err;
      if (!isModelLevelError(err?.status)) throw err;
      console.warn(`[Gemini] model "${modelName}" rejected (HTTP ${err?.status}); trying next candidate`);
    }
  }
  throw lastErr || new Error('Gemini request failed for all candidate models');
}

export async function callGeminiText({ prompt, temperature = 0.2, maxOutputTokens = 800 }) {
  const useVertex = shouldUseVertex();
  const hasApiKey = !!(process.env.GEMINI_API_KEY || '').trim();

  if (useVertex) {
    const projectId = getProjectId();
    const location = String(process.env.VERTEX_AI_LOCATION || 'us-central1').trim() || 'us-central1';
    const configuredModel =
      String(process.env.GEMINI_MODEL || process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash').trim() || 'gemini-2.0-flash';

    // Vertex can be unusable for a project even when GCP creds exist: the project
    // may lack Gemini model access (403/404) or token minting can fail. In those
    // cases, transparently fall back to the GEMINI_API_KEY path when available so
    // every caller (translation, note writer, etc.) keeps working.
    try {
      const token = await getAccessToken();
      const candidates = buildCandidateModels(configuredModel);
      let lastErr = null;
      for (const modelName of candidates) {
        try {
          return await performVertexCall({
            modelName, projectId, location, token, prompt, temperature, maxOutputTokens
          });
        } catch (err) {
          lastErr = err;
          // Model-level errors (bad/denied model) → try next model. Anything else
          // (auth/quota/network) won't be fixed by swapping models, so stop looping.
          if (!isModelLevelError(err?.status)) throw err;
          console.warn(`[Vertex] model "${modelName}" rejected (HTTP ${err?.status}); trying next candidate`);
        }
      }
      throw lastErr || new Error('Vertex Gemini request failed for all candidate models');
    } catch (vertexErr) {
      if (hasApiKey) {
        console.warn(
          `[Vertex] unavailable (${vertexErr?.status || 'error'}: ${vertexErr?.message}); falling back to GEMINI_API_KEY path`
        );
        return callViaApiKey({ prompt, temperature, maxOutputTokens });
      }
      throw vertexErr;
    }
  }

  return callViaApiKey({ prompt, temperature, maxOutputTokens });
}
