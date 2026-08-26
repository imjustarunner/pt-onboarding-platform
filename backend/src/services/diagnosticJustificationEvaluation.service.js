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
 * AI score: how well justification matches DSM-5-TR criteria for the ICD-10 code.
 * @returns {Promise<{ score: number|null, summary: string, gaps: string|null, unavailable?: boolean }>}
 */
export async function evaluateDiagnosticJustification({
  icd10Code,
  description = '',
  justification = ''
}) {
  const code = String(icd10Code || '').trim().toUpperCase();
  const desc = String(description || '').trim();
  const just = String(justification || '').trim();
  if (!code || !just) {
    return { score: null, summary: 'Diagnosis code and justification are required.', gaps: null };
  }

  const prompt = `You are a clinical documentation reviewer. Rate how well the written diagnostic justification supports assigning ICD-10 code ${code}${desc ? ` (${desc})` : ''}, using standard DSM-5-TR diagnostic criteria for that disorder/category.

Justification text:
"""
${just.slice(0, 6000)}
"""

Respond with JSON only (no markdown):
{
  "score": <integer 0-100, where 100 = clearly meets criteria with specific evidence>,
  "summary": "<2-3 sentences explaining the rating>",
  "gaps": "<what evidence or criteria elements are missing, or empty string if score >= 85>"
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
