import { callGeminiText } from './geminiText.service.js';

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * AI score: how well justification matches DSM-5-TR criteria for the ICD-10 code(s).
 * @returns {Promise<{ score: number|null, summary: string, gaps: string|null, unavailable?: boolean }>}
 */
export async function evaluateDiagnosticJustification({
  icd10Code,
  description = '',
  justification = '',
  diagnoses = null
}) {
  const just = String(justification || '').trim();
  const list = Array.isArray(diagnoses)
    ? diagnoses
      .map((d) => ({
        code: String(d?.icd10Code || d?.code || '').trim().toUpperCase(),
        description: String(d?.description || '').trim()
      }))
      .filter((d) => d.code)
    : [];

  const primaryCode = String(icd10Code || list[0]?.code || '').trim().toUpperCase();
  const primaryDesc = String(description || list[0]?.description || '').trim();
  if (!primaryCode || !just) {
    return { score: null, summary: 'Diagnosis code and justification are required.', gaps: null };
  }

  const dxLines = (list.length ? list : [{ code: primaryCode, description: primaryDesc }])
    .map((d, i) => `${i === 0 ? 'Primary' : `Secondary ${i}`}: ${d.code}${d.description ? ` (${d.description})` : ''}`)
    .join('\n');

  const prompt = `You are a clinical documentation reviewer. Rate how well the written diagnostic justification supports the full diagnosis list below, using standard DSM-5-TR diagnostic criteria for each disorder/category.

Diagnoses:
${dxLines}

Justification text (one narrative covering the list):
"""
${just.slice(0, 6000)}
"""

Respond with JSON only (no markdown):
{
  "score": <integer 0-100, where 100 = clearly meets criteria with specific evidence for the listed diagnoses>,
  "summary": "<2-3 sentences explaining the rating across the diagnosis list>",
  "gaps": "<what evidence or criteria elements are missing for any listed diagnosis, or empty string if score >= 85>"
}`;

  try {
    const gemini = await callGeminiText({
      prompt,
      temperature: 0.1,
      maxOutputTokens: 600
    });
    const parsed = parseJsonObject(gemini?.text);
    if (!parsed) {
      return {
        score: null,
        summary: 'Could not parse AI evaluation response.',
        gaps: null,
        unavailable: true
      };
    }
    const scoreRaw = Number(parsed.score);
    const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null;
    return {
      score,
      summary: String(parsed.summary || '').trim() || 'Evaluation complete.',
      gaps: String(parsed.gaps || '').trim() || null
    };
  } catch (e) {
    return {
      score: null,
      summary: e?.message || 'AI evaluation unavailable.',
      gaps: null,
      unavailable: true
    };
  }
}

export default { evaluateDiagnosticJustification };
