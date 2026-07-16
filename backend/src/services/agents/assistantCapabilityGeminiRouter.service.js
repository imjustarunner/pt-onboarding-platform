/**
 * Gemini verify / course-correct for Ask Assistant catalog routing.
 *
 * TF–IDF proposes; Gemini only picks a closed capabilityId (or null).
 * Never invents tool results, counts, or free-form answers.
 */

import { callGeminiText } from '../geminiText.service.js';

/** Default on. Set ASK_ASSISTANT_GEMINI_ROUTER=0 to use TF–IDF only. */
export function askAssistantGeminiRouterEnabled() {
  const v = String(process.env.ASK_ASSISTANT_GEMINI_ROUTER ?? '1').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return true;
}

function stripJsonFences(raw) {
  let s = String(raw || '').trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return s;
}

export function parseCapabilityRouterJson(raw) {
  const s = stripJsonFences(raw);
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== 'object') return null;
    let id = obj.capabilityId;
    if (id === undefined && obj.capability_id !== undefined) id = obj.capability_id;
    if (id === null || id === 'null' || id === '') {
      return { capabilityId: null, confidence: String(obj.confidence || '').toLowerCase() || null };
    }
    if (typeof id !== 'string') return null;
    const capabilityId = id.trim();
    if (!capabilityId) return { capabilityId: null, confidence: null };
    return {
      capabilityId,
      confidence: String(obj.confidence || '').toLowerCase() || null
    };
  } catch {
    // Best-effort: look for "capabilityId": "foo"
    const m = s.match(/"capabilityId"\s*:\s*"(null|[a-z0-9_]+)"/i) ||
      s.match(/"capability_id"\s*:\s*"(null|[a-z0-9_]+)"/i);
    if (!m) return null;
    const id = m[1].toLowerCase() === 'null' ? null : m[1];
    return { capabilityId: id, confidence: null };
  }
}

function compactEntryLine(entry) {
  const id = String(entry?.id || '').trim();
  if (!id) return '';
  const prompt = String(entry?.prompt || '').trim().slice(0, 120);
  const examples = (Array.isArray(entry?.semanticExamples) ? entry.semanticExamples : [])
    .slice(0, 3)
    .map((e) => String(e || '').trim())
    .filter(Boolean)
    .join('; ')
    .slice(0, 160);
  const hints = (Array.isArray(entry?.routeHints) ? entry.routeHints : [])
    .slice(0, 4)
    .map((h) => String(h || '').trim())
    .filter(Boolean)
    .join(', ')
    .slice(0, 100);
  const bits = [`id=${id}`, `example="${prompt}"`];
  if (examples) bits.push(`also: ${examples}`);
  if (hints) bits.push(`hints: ${hints}`);
  return bits.join(' | ');
}

/**
 * @param {{
 *   prompt: string,
 *   ranked?: Array<{ capabilityId: string, score?: number, entry?: object }>,
 *   eligibleEntries: Array<object>,
 *   callGemini?: typeof callGeminiText
 * }} args
 * @returns {Promise<{
 *   capabilityId: string|null,
 *   confidence: string|null,
 *   geminiVerified: boolean,
 *   geminiCorrected: boolean,
 *   tfidfTopId: string|null,
 *   error?: string
 * }>}
 */
export async function verifyOrCorrectCapabilityRoute({
  prompt,
  ranked = [],
  eligibleEntries = [],
  callGemini = callGeminiText
} = {}) {
  const allowedIds = new Set(
    (eligibleEntries || []).map((e) => String(e?.id || '').trim()).filter(Boolean)
  );
  if (!allowedIds.size) {
    return {
      capabilityId: null,
      confidence: null,
      geminiVerified: false,
      geminiCorrected: false,
      tfidfTopId: null,
      error: 'no_eligible'
    };
  }

  const tfidfTopId = ranked?.[0]?.capabilityId ? String(ranked[0].capabilityId) : null;
  const topHints = (ranked || [])
    .slice(0, 5)
    .map((r, i) => {
      const id = String(r.capabilityId || r.entry?.id || '').trim();
      if (!id || !allowedIds.has(id)) return null;
      const score = typeof r.score === 'number' ? r.score.toFixed(3) : '?';
      return `${i + 1}. ${id} (tfidf=${score})`;
    })
    .filter(Boolean);

  const catalogLines = (eligibleEntries || [])
    .map(compactEntryLine)
    .filter(Boolean)
    .slice(0, 40);

  const routerPrompt = [
    'You route Ask Assistant user messages to ONE closed capability id.',
    'Return ONLY JSON (no markdown): {"capabilityId":"<id>"|null,"confidence":"high"|"medium"|"low"}',
    '',
    'Rules:',
    '- capabilityId MUST be one of the catalog ids below, or null if none fit.',
    '- Prefer the top TF-IDF hint when it clearly matches the user ask.',
    '- Otherwise course-correct to a better catalog id.',
    '- Never invent tools, names, counts, or answer text.',
    '- Operational DB asks (client/student counts at a school) are NOT in this list; return null for those.',
    '- Service-code / billing-code definitions are NOT in this list; return null for those.',
    '',
    `User ask: ${String(prompt || '').trim().slice(0, 400)}`,
    '',
    'TF-IDF ranked hints (best first):',
    topHints.length ? topHints.join('\n') : '(none)',
    '',
    'Catalog (closed set):',
    catalogLines.join('\n')
  ].join('\n');

  try {
    const result = await callGemini({
      prompt: routerPrompt,
      temperature: 0,
      maxOutputTokens: 120
    });
    const parsed = parseCapabilityRouterJson(result?.text);
    if (!parsed) {
      return {
        capabilityId: null,
        confidence: null,
        geminiVerified: false,
        geminiCorrected: false,
        tfidfTopId,
        error: 'parse_failed'
      };
    }
    let capabilityId = parsed.capabilityId;
    if (capabilityId && !allowedIds.has(capabilityId)) {
      return {
        capabilityId: null,
        confidence: parsed.confidence,
        geminiVerified: false,
        geminiCorrected: false,
        tfidfTopId,
        error: 'invalid_id'
      };
    }
    const geminiCorrected = Boolean(capabilityId && tfidfTopId && capabilityId !== tfidfTopId);
    const geminiVerified = Boolean(capabilityId && tfidfTopId && capabilityId === tfidfTopId);
    return {
      capabilityId,
      confidence: parsed.confidence,
      geminiVerified,
      geminiCorrected,
      tfidfTopId
    };
  } catch (e) {
    return {
      capabilityId: null,
      confidence: null,
      geminiVerified: false,
      geminiCorrected: false,
      tfidfTopId,
      error: String(e?.message || e || 'gemini_failed').slice(0, 200)
    };
  }
}
