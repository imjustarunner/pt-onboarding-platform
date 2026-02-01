import { GoogleAuth } from 'google-auth-library';
import config from '../../config/config.js';
import { parseGoogleWorkspaceServiceAccountFromEnv } from '../googleWorkspaceAuth.service.js';
import { getToolSchemas } from './toolRegistry.service.js';

function sanitizeText(v, { maxLen }) {
  const s = String(v ?? '')
    .replace(/\u0000/g, '')
    .trim();
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
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

function buildSystemPrompt({ includeSearch, agentConfig }) {
  const cfg = agentConfig && typeof agentConfig === 'object' ? agentConfig : null;
  const allowedToolsRaw = Array.isArray(cfg?.allowedTools) ? cfg.allowedTools : null;
  const allowedSet = allowedToolsRaw ? new Set(allowedToolsRaw.map((t) => String(t || '').trim()).filter(Boolean)) : null;
  const allTools = getToolSchemas();
  const tools = allowedSet ? allTools.filter((t) => allowedSet.has(t.name)) : allTools;
  const agentSystemPrompt = cfg?.systemPrompt == null ? null : String(cfg.systemPrompt).slice(0, 6000);
  return [
    'You are the in-app assistant for a business web application.',
    '',
    agentSystemPrompt ? `Additional instructions:\n${agentSystemPrompt}` : '',
    '',
    'Return ONLY valid JSON with this schema:',
    '{',
    '  "assistantText": string,',
    '  "uiCommands": [ { "type": "navigate", "to": string } | { "type": "highlight", "selector": string } | { "type": "openHelper" } | { "type": "closeHelper" } ] ,',
    '  "toolCalls": [ { "name": string, "args": object } ]',
    '}',
    '',
    'Rules:',
    '- Do not include markdown or explanations outside JSON.',
    '- If you are unsure, do not call tools; ask a clarifying question in assistantText.',
    '- uiCommands must be minimal and safe.',
    '- toolCalls must match these allowed tools exactly:',
    JSON.stringify(tools, null, 2),
    '',
    includeSearch
      ? 'You may use Google Search grounding if available in your environment.'
      : 'Do not rely on Google Search. Answer using provided context only.',
  ].join('\n');
}

async function callVertexModelJson({ token, projectId, location, modelId, systemPrompt, userPrompt, timeoutMs }) {
  const url = `https://${encodeURIComponent(location)}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelId)}:generateContent`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1400
      }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const t = String(await resp.text()).slice(0, 2000);
      const err = new Error('Vertex AI request failed');
      err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      err.details = t;
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
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function callReasoningEngineStreamQuerySse({ token, projectId, location, reasoningEngineId, payload, timeoutMs }) {
  const url = `https://${encodeURIComponent(location)}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/locations/${encodeURIComponent(location)}/reasoningEngines/${encodeURIComponent(reasoningEngineId)}:streamQuery?alt=sse`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      signal: controller.signal,
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const t = String(await resp.text()).slice(0, 2000);
      const err = new Error('Agent Engine request failed');
      err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      err.details = t;
      throw err;
    }

    // Parse SSE stream; collect last JSON event with text.
    const reader = resp.body?.getReader?.();
    if (!reader) {
      const err = new Error('Streaming response not supported');
      err.status = 502;
      throw err;
    }

    const decoder = new TextDecoder('utf-8');
    let buf = '';
    let lastText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE events are separated by double newline.
      const chunks = buf.split('\n\n');
      buf = chunks.pop() || '';
      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice('data:'.length).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const evt = JSON.parse(jsonStr);
            const parts = evt?.content?.parts;
            const text = Array.isArray(parts) ? parts.map((p) => p?.text || '').filter(Boolean).join('') : '';
            if (text) lastText = text;
          } catch {
            // ignore malformed event
          }
        }
      }
    }

    if (!lastText) {
      const err = new Error('Agent returned empty response');
      err.status = 502;
      throw err;
    }
    return lastText;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAdkService({ url, prompt, context, userId, allowSearch, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      signal: controller.signal,
      body: JSON.stringify({
        prompt,
        context: context && typeof context === 'object' ? context : {},
        userId: userId || null,
        allowSearch: !!allowSearch
      })
    });

    if (!resp.ok) {
      const t = String(await resp.text()).slice(0, 2000);
      const err = new Error('ADK agent service request failed');
      err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      err.details = t;
      throw err;
    }

    const data = await resp.json().catch(() => null);
    if (data && typeof data === 'object') {
      // Accept either a raw JSON string, or the parsed object itself.
      if (typeof data.rawText === 'string') return data.rawText;
      return JSON.stringify(data);
    }

    const t = String(await resp.text()).trim();
    if (!t) {
      const err = new Error('ADK agent returned empty response');
      err.status = 502;
      throw err;
    }
    return t;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAgentAssist({ userId, prompt, context, agentConfig, allowSearch }) {
  const cleanedPrompt = sanitizeText(prompt, { maxLen: 8000 });
  const ctx = context && typeof context === 'object' ? context : {};

  const systemPrompt = buildSystemPrompt({ includeSearch: !!allowSearch, agentConfig });
  const userPrompt = [
    `UserId: ${String(userId || '')}`,
    `RouteName: ${String(ctx.routeName || '')}`,
    `PlacementKey: ${String(ctx.placementKey || '')}`,
    `AgencyId: ${String(ctx.agencyId || '')}`,
    `OrganizationId: ${String(ctx.organizationId || '')}`,
    '',
    'User prompt:',
    cleanedPrompt
  ].join('\n');

  const projectId = process.env.GCP_PROJECT_ID || process.env.GCS_PROJECT_ID || '';
  const location = String(process.env.VERTEX_AI_LOCATION || 'us-central1').trim() || 'us-central1';
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.VERTEX_AI_AGENT_TIMEOUT_MS || '45000', 10) || 45000, 5000),
    120000
  );

  // Optional: delegate to an external Python ADK service (Cloud Run) if configured.
  // This is useful if you prefer programming agents in Python with google.adk.
  const adkUrl = String(process.env.ADK_AGENT_URL || '').trim();
  if (adkUrl) {
    const txt = await callAdkService({
      url: adkUrl,
      prompt: [systemPrompt, '', userPrompt].join('\n'),
      context: ctx,
      userId,
      allowSearch,
      timeoutMs
    });
    return { rawText: txt, runtime: 'adk_service' };
  }

  if (!projectId) {
    const err = new Error('GCP_PROJECT_ID (or GCS_PROJECT_ID) is not configured');
    err.status = 503;
    throw err;
  }

  const token = await getAccessToken();

  // Primary: Reasoning Engine (Agent Engine / Agent Builder) if configured.
  const reasoningEngineId = String(process.env.VERTEX_AGENT_ENGINE_ID || '').trim();
  if (reasoningEngineId) {
    const payload = {
      class_method: 'async_stream_query',
      input: {
        user_id: String(userId || 'user'),
        // session_id optional: if omitted, Agent Engine will create one automatically (per docs).
        message: [systemPrompt, '', userPrompt].join('\n')
      }
    };
    const txt = await callReasoningEngineStreamQuerySse({
      token,
      projectId,
      location,
      reasoningEngineId,
      payload,
      timeoutMs
    });
    return { rawText: txt, runtime: 'vertex_agent_engine' };
  }

  // Fallback: Vertex model direct call (still Google-hosted, but not Agent Engine).
  const modelId = String(process.env.VERTEX_AI_AGENT_MODEL || 'gemini-2.0-flash').trim() || 'gemini-2.0-flash';
  const txt = await callVertexModelJson({
    token,
    projectId,
    location,
    modelId,
    systemPrompt,
    userPrompt,
    timeoutMs
  });
  return { rawText: txt, runtime: 'vertex_model' };
}

export function safeParseAgentJson(rawText) {
  const t = String(rawText || '').trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    // Common failure: extra text around JSON. Best-effort extraction.
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(t.slice(first, last + 1));
      } catch {
        // ignore
      }
    }
    const err = new Error('Agent response was not valid JSON');
    err.status = 502;
    if (config.nodeEnv === 'development') err.details = String(t).slice(0, 2000);
    throw err;
  }
}

