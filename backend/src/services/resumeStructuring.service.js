import { GoogleAuth } from 'google-auth-library';
import { parseGoogleWorkspaceServiceAccountFromEnv } from './googleWorkspaceAuth.service.js';

function safeTruncate(s, maxLen) {
  const t = String(s || '').replace(/\u0000/g, '').trim();
  if (!maxLen) return t;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function stripCodeFences(s) {
  const t = String(s || '').trim();
  // Remove ```json ... ``` or ``` ... ```
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m?.[1] ? m[1].trim() : t;
}

function extractJsonFromModelText(text) {
  const raw = stripCodeFences(text);
  // Best effort: find first {...} block
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw;
}

async function getAccessToken() {
  const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
  const authSource = String(process.env.VERTEX_AUTH_SOURCE || '').trim().toLowerCase(); // 'workspace_service_account' | ''
  const workspaceSa =
    authSource === 'workspace_service_account' ? parseGoogleWorkspaceServiceAccountFromEnv() : null;

  const auth = workspaceSa
    ? new GoogleAuth({ credentials: workspaceSa, scopes })
    : new GoogleAuth({ scopes });

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

export async function generateResumeSummaryJson({ candidateName, resumeText }) {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GCS_PROJECT_ID || '';
  const location = String(process.env.VERTEX_AI_LOCATION || 'us-central1').trim() || 'us-central1';
  const modelId = String(process.env.VERTEX_AI_RESUME_MODEL || 'gemini-2.0-flash').trim() || 'gemini-2.0-flash';
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.VERTEX_AI_RESUME_TIMEOUT_MS || '90000', 10) || 90000, 5000),
    180000
  );
  const maxOutputTokens = Math.min(
    Math.max(parseInt(process.env.VERTEX_AI_RESUME_MAX_OUTPUT_TOKENS || '1400', 10) || 1400, 300),
    4096
  );

  if (!projectId) {
    const err = new Error('GCP_PROJECT_ID (or GCS_PROJECT_ID) is not configured');
    err.status = 503;
    throw err;
  }

  const name = safeTruncate(candidateName, 180);
  const resume = safeTruncate(resumeText, 18000);
  if (!resume) {
    const err = new Error('No resume text provided');
    err.status = 400;
    throw err;
  }

  const systemPrompt = [
    'You are an HR data extraction assistant.',
    'Extract structured hiring data from the resume text.',
    'Return ONLY valid JSON. Do not include markdown, comments, or extra keys outside the schema.',
    'If a value is not present, use null or an empty array. Do not guess.',
    '',
    'Schema (strict):',
    '{',
    '  "workHistory": [ { "employer": string|null, "title": string|null, "startDate": string|null, "endDate": string|null, "location": string|null, "summary": string|null } ],',
    '  "education": [ { "school": string|null, "degree": string|null, "field": string|null, "startDate": string|null, "endDate": string|null, "notes": string|null } ],',
    '  "licensesAndCertifications": [ { "name": string|null, "state": string|null, "licenseNumber": string|null, "issuedDate": string|null, "expirationDate": string|null, "status": string|null } ],',
    '  "skills": [string],',
    '  "credentialingHints": {',
    '     "likelyLicensureStatus": "licensed"|"associate"|"intern"|"unknown",',
    '     "statesMentioned": [string],',
    '     "needsSupervision": boolean|null,',
    '     "notesForCredentialingTeam": string|null',
    '  }',
    '}'
  ].join('\n');

  const userPrompt = [
    `Candidate name: ${name || '(unknown)'}`,
    '',
    'Resume text:',
    resume
  ].join('\n');

  const token = await getAccessToken();
  const url = `https://${encodeURIComponent(location)}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelId)}:generateContent`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const started = Date.now();
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        model: `projects/${projectId}/locations/${location}/publishers/google/models/${modelId}`,
        generationConfig: { temperature: 0.1, maxOutputTokens }
      })
    });

    const latencyMs = Date.now() - started;

    if (!resp.ok) {
      const t = String(await resp.text()).slice(0, 2000);
      const err = new Error('Vertex AI resume summary request failed');
      err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      err.details = t;
      err.latencyMs = latencyMs;
      throw err;
    }

    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p?.text || '').filter(Boolean).join('') : '';
    if (!text) {
      const err = new Error('Model returned empty response');
      err.status = 502;
      throw err;
    }

    const jsonText = extractJsonFromModelText(text);
    let parsed = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      const err = new Error('Model returned non-JSON resume summary');
      err.status = 502;
      err.details = safeTruncate(jsonText, 1800);
      throw err;
    }

    return {
      summary: parsed,
      latencyMs,
      modelId
    };
  } finally {
    clearTimeout(timeout);
  }
}

