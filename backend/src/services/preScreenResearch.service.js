import { GoogleAuth } from 'google-auth-library';
import { parseGoogleWorkspaceServiceAccountFromEnv } from './googleWorkspaceAuth.service.js';
import { callGeminiText } from './geminiText.service.js';

function sanitizeText(v, { maxLen }) {
  const s = String(v ?? '')
    .replace(/\u0000/g, '')
    .trim();
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function buildPreScreenPrompt({
  candidateName,
  resumeText,
  linkedInUrl,
  psychologyTodayUrl,
  candidateLocation,
  jobTitle,
  jobDescriptionText,
  coverLetterText
}) {
  const name = sanitizeText(candidateName, { maxLen: 180 });
  const resume = sanitizeText(resumeText, { maxLen: 16000 });
  const linkedin = sanitizeText(linkedInUrl, { maxLen: 500 });
  const psy = sanitizeText(psychologyTodayUrl, { maxLen: 700 });
  const loc = sanitizeText(candidateLocation, { maxLen: 180 });
  const jt = sanitizeText(jobTitle, { maxLen: 255 });
  const jd = sanitizeText(jobDescriptionText, { maxLen: 60000 });
  const cl = sanitizeText(coverLetterText, { maxLen: 20000 });

  const systemPrompt =
    'Research this candidate. Verify their employment history against public records. Search for their GitHub or portfolio. Flag any discrepancies between the provided resume text and public data. Do not search for private social media.';

  const userPrompt = [
    `Candidate name: ${name || '(not provided)'}`,
    loc ? `Candidate location (provided): ${loc}` : 'Candidate location (provided): (none)',
    linkedin ? `LinkedIn URL (provided): ${linkedin}` : 'LinkedIn URL (provided): (none)',
    psy ? `Psychology Today profile URL (provided): ${psy}` : 'Psychology Today profile URL (provided): (none)',
    '',
    'Job posting (provided by recruiter/admin):',
    jt ? `Job title: ${jt}` : 'Job title: (not provided)',
    jd ? `Job description:\n${jd}` : 'Job description: (not provided)',
    '',
    cl ? `Cover letter (provided):\n${cl}` : 'Cover letter (provided): (none)',
    '',
    'Resume text (provided by recruiter/admin):',
    resume ? resume : '(none provided)',
    '',
    'Method (be thorough):',
    '- Run multiple targeted searches to disambiguate identity if the name is common.',
    '- Look for professional artifacts: GitHub/GitLab, personal portfolio, publications, conference talks, package registries.',
    '- If the candidate is likely a therapist/provider, look specifically for their Psychology Today public profile (site:psychologytoday.com). If found, cite it and extract: license type/state, specialties, modalities, and location. Use it only if identity is a confident match.',
    '- Verify each employment claim (company + title + dates) using only publicly available sources. If you cannot verify, say so.',
    '- If results could be a different person, label it "Unverified Potential Match" and explain why.',
    '- Evaluate how the candidate matches the job posting criteria. Be concise and specific.',
    '',
    'Output requirements:',
    '- Output Markdown.',
    '- Be concise. Prefer bullets over paragraphs.',
    '- Include an "Identity & Match Confidence" section (how you determined it is the same person).',
    '- Include an "Employment Verification" section (table: employer, claimed, public evidence, status).',
    '- Include a "Psychology Today (if found)" section with:',
    '  - Profile URL',
    '  - License (type/state) if listed',
    '  - Location if listed',
    '  - Specialties/modality highlights (bullets)',
    '- Include a "Job Match Summary" section with:',
    '  - Strengths (3-8 bullets, each maps to a job requirement).',
    '  - Weaknesses / discussion points (3-8 bullets, each maps to a job requirement).',
    '  - Requirements checklist (bullet list of key criteria inferred from the job description, mark as Meets / Partially meets / Does not meet / Unknown).',
    '- Include a "Discrepancies" section (bullet list).',
    '- Include a "Professional Artifacts" section (links + 1-sentence notes).',
    '- Include a "Sources" section with direct URLs for every factual claim you relied on.',
    '- If you cannot verify a claim with a public source, label it "Unverified" (do not guess).',
    '- Do NOT include or reference private social media.'
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    normalized: { name, resume, linkedin, psychologyTodayUrl: psy, candidateLocation: loc, jobTitle: jt, jobDescriptionText: jd, coverLetterText: cl }
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generatePreScreenReportWithGeminiApiKey({
  candidateName,
  resumeText,
  linkedInUrl,
  psychologyTodayUrl = '',
  candidateLocation = '',
  jobTitle = '',
  jobDescriptionText = '',
  coverLetterText = ''
}) {
  const maxOutputTokens = Math.min(
    Math.max(parseInt(process.env.GEMINI_PRESCREEN_MAX_OUTPUT_TOKENS || '1800', 10) || 1800, 300),
    4096
  );

  const { systemPrompt, userPrompt, normalized } = buildPreScreenPrompt({
    candidateName,
    resumeText,
    linkedInUrl,
    psychologyTodayUrl,
    candidateLocation,
    jobTitle,
    jobDescriptionText,
    coverLetterText
  });

  const prompt = [systemPrompt, '', userPrompt].filter(Boolean).join('\n');
  const { text, latencyMs, modelName } = await callGeminiText({
    prompt,
    temperature: 0.2,
    maxOutputTokens
  });

  return {
    text: String(text).trim(),
    latencyMs,
    modelId: modelName,
    isGrounded: false,
    normalizedInput: normalized,
    groundingMetadata: null
  };
}

async function getAccessToken() {
  const scopes = ['https://www.googleapis.com/auth/cloud-platform'];

  // Optional: reuse the same Workspace service account JSON used for Calendar/Gmail.
  // This makes Vertex calls use the same Google identity "that we know is working",
  // as long as that service account is also granted the required GCP IAM roles.
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

export async function generatePreScreenReportWithGoogleSearch({
  candidateName,
  resumeText,
  linkedInUrl,
  psychologyTodayUrl = '',
  candidateLocation = '',
  jobTitle = '',
  jobDescriptionText = '',
  coverLetterText = '',
  excludeDomains = []
}) {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GCS_PROJECT_ID || '';
  const location = String(process.env.VERTEX_AI_LOCATION || 'us-central1').trim() || 'us-central1';
  const modelId = String(process.env.VERTEX_AI_RESEARCH_MODEL || 'gemini-2.5-pro').trim() || 'gemini-2.5-pro';
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.VERTEX_AI_RESEARCH_TIMEOUT_MS || '120000', 10) || 120000, 5000),
    180000
  );
  const maxOutputTokens = Math.min(
    Math.max(parseInt(process.env.VERTEX_AI_RESEARCH_MAX_OUTPUT_TOKENS || '2400', 10) || 2400, 300),
    4096
  );

  if (!projectId) {
    const err = new Error('GCP_PROJECT_ID (or GCS_PROJECT_ID) is not configured');
    err.status = 503;
    throw err;
  }

  const { systemPrompt, userPrompt, normalized } = buildPreScreenPrompt({
    candidateName,
    resumeText,
    linkedInUrl,
    psychologyTodayUrl,
    candidateLocation,
    jobTitle,
    jobDescriptionText,
    coverLetterText
  });

  const token = await getAccessToken();
  const url = `https://${encodeURIComponent(location)}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelId)}:generateContent`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const started = Date.now();
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      // Keep system prompt explicit as an instruction part for consistency.
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [
        {
          googleSearch: {
            exclude_domains: Array.isArray(excludeDomains)
              ? excludeDomains.map((d) => String(d || '').trim()).filter(Boolean).slice(0, 20)
              : []
          }
        }
      ],
      model: `projects/${projectId}/locations/${location}/publishers/google/models/${modelId}`,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens
      }
    };

    // Retry once for transient errors (quota/service hiccups).
    let resp = null;
    let lastErrText = '';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        signal: controller.signal,
        body: JSON.stringify(body)
      });

      if (resp.ok) break;
      lastErrText = String(await resp.text()).slice(0, 2000);

      const transient = resp.status === 429 || resp.status === 500 || resp.status === 503;
      const remainingMs = timeoutMs - (Date.now() - started);
      if (!transient || attempt === 2 || remainingMs < 8000) break;
      await sleep(900);
    }

    const latencyMs = Date.now() - started;

    if (!resp?.ok) {
      const err = new Error('Vertex AI research request failed');
      err.status = resp?.status >= 400 && resp?.status < 600 ? resp.status : 502;
      err.details = lastErrText;
      err.latencyMs = latencyMs;
      throw err;
    }

    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p?.text || '').filter(Boolean).join('') : '';

    if (!text) {
      const err = new Error('Model returned empty response');
      err.status = 502;
      err.latencyMs = latencyMs;
      throw err;
    }

    const groundingMetadata = data?.candidates?.[0]?.groundingMetadata || null;
    const webSearchQueries = groundingMetadata?.webSearchQueries || [];
    const searchEntryPoint = groundingMetadata?.searchEntryPoint || null;
    const groundingChunks = groundingMetadata?.groundingChunks || [];

    const isGrounded = Array.isArray(groundingChunks) && groundingChunks.length > 0;

    return {
      text: String(text).trim(),
      latencyMs,
      modelId,
      isGrounded,
      normalizedInput: normalized,
      groundingMetadata: groundingMetadata
        ? {
            webSearchQueries,
            searchEntryPoint,
            groundingChunks
          }
        : null
    };
  } catch (e) {
    const isAbort = e?.name === 'AbortError';
    if (isAbort) {
      const err = new Error('Vertex AI research request timed out');
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generatePreScreenReportWithVertexNoSearch({
  candidateName,
  resumeText,
  linkedInUrl,
  psychologyTodayUrl = '',
  candidateLocation = '',
  jobTitle = '',
  jobDescriptionText = '',
  coverLetterText = ''
}) {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GCS_PROJECT_ID || '';
  const location = String(process.env.VERTEX_AI_LOCATION || 'us-central1').trim() || 'us-central1';
  const modelId = String(process.env.VERTEX_AI_RESEARCH_MODEL || 'gemini-2.5-pro').trim() || 'gemini-2.5-pro';
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.VERTEX_AI_RESEARCH_TIMEOUT_MS || '120000', 10) || 120000, 5000),
    180000
  );
  const maxOutputTokens = Math.min(
    Math.max(parseInt(process.env.VERTEX_AI_RESEARCH_MAX_OUTPUT_TOKENS || '2400', 10) || 2400, 300),
    4096
  );

  if (!projectId) {
    const err = new Error('GCP_PROJECT_ID (or GCS_PROJECT_ID) is not configured');
    err.status = 503;
    throw err;
  }

  const { systemPrompt, userPrompt, normalized } = buildPreScreenPrompt({
    candidateName,
    resumeText,
    linkedInUrl,
    psychologyTodayUrl,
    candidateLocation,
    jobTitle,
    jobDescriptionText,
    coverLetterText
  });
  const token = await getAccessToken();
  const url = `https://${encodeURIComponent(location)}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelId)}:generateContent`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const started = Date.now();
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      model: `projects/${projectId}/locations/${location}/publishers/google/models/${modelId}`,
      generationConfig: { temperature: 0.2, maxOutputTokens }
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

    const latencyMs = Date.now() - started;

    if (!resp.ok) {
      const t = String(await resp.text()).slice(0, 2000);
      const err = new Error('Vertex AI pre-screen request failed');
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
      err.latencyMs = latencyMs;
      throw err;
    }

    return {
      text: String(text).trim(),
      latencyMs,
      modelId,
      isGrounded: false,
      normalizedInput: normalized,
      groundingMetadata: null
    };
  } catch (e) {
    const isAbort = e?.name === 'AbortError';
    if (isAbort) {
      const err = new Error('Vertex AI pre-screen request timed out');
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

