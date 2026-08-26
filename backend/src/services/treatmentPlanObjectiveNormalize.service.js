import { callGeminiText } from './geminiText.service.js';
import { inferScaleDirection } from './treatmentPlanImport.service.js';

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

function clampScale(n) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 10) return null;
  return v;
}

/**
 * Use AI to rewrite an objective with explicit 1–10 current → target scales.
 * @returns {Promise<{ objectiveText: string, scaleCurrent: number, scaleTarget: number, scaleDirection: string, explanation: string }|null>}
 */
export async function suggestObjectiveScaleRewrite(objectiveText) {
  const text = String(objectiveText || '').trim();
  if (!text) return null;

  const prompt = `You are a clinical treatment plan editor. Rewrite the treatment plan objective below so progress is measured on a 1–10 scale only, with explicit integer current and target ratings (each between 1 and 10, and they must differ).

Rules:
- The rewritten objective should be one or two clear sentences.
- Include the 1–10 current → target direction in plain language (e.g. "from a current level of 8 to a target of 4").
- Do not use percentages, frequency counts, or other measurement methods — the 1–10 scale is the measurement.
- Choose clinically reasonable numbers based on the original wording.

Original objective:
"""
${text.slice(0, 4500)}
"""

Respond with JSON only (no markdown):
{
  "objectiveText": "<rewritten objective>",
  "scaleCurrent": <integer 1-10>,
  "scaleTarget": <integer 1-10>,
  "scaleDirection": "increase" | "decrease",
  "explanation": "<one short sentence explaining the scale choice>"
}`;

  const gemini = await callGeminiText({
    prompt,
    temperature: 0.15,
    maxOutputTokens: 700
  });
  const parsed = parseJsonObject(gemini?.text);
  if (!parsed) return null;

  const scaleCurrent = clampScale(parsed.scaleCurrent);
  const scaleTarget = clampScale(parsed.scaleTarget);
  const objectiveOut = String(parsed.objectiveText || '').trim();
  if (!objectiveOut || scaleCurrent == null || scaleTarget == null || scaleCurrent === scaleTarget) {
    return null;
  }

  const scaleDirection =
    parsed.scaleDirection === 'increase' || parsed.scaleDirection === 'decrease'
      ? parsed.scaleDirection
      : inferScaleDirection(scaleCurrent, scaleTarget);

  return {
    objectiveText: objectiveOut,
    scaleCurrent,
    scaleTarget,
    scaleDirection,
    explanation: String(parsed.explanation || '').trim() || 'Suggested 1–10 scale from imported wording.'
  };
}

export default { suggestObjectiveScaleRewrite };
