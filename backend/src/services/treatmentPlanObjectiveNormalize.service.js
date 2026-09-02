import { callGeminiText } from './geminiText.service.js';
import {
  inferScaleDirection,
  stripPlanBoilerplateLabels
} from './treatmentPlanImport.service.js';

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

function heuristicScaleRewrite(objectiveText, clinicianInstructions = '') {
  const cleaned = stripPlanBoilerplateLabels(objectiveText);
  const instruction = String(clinicianInstructions || '').trim();
  const blob = `${cleaned}\n${instruction}`;
  const decrease = /\b(reduc|decreas|less|infrequent|lower|minimiz|combat|distress|anxiety|depression|anger|avoid)/i.test(blob);
  const increase = /\b(improv|increas|more|enhanc|build|strengthen|self[- ]?esteem|communication|self[- ]?care)/i.test(blob);
  let scaleCurrent;
  let scaleTarget;
  let scaleDirection;
  if (decrease && !increase) {
    scaleCurrent = 8;
    scaleTarget = 3;
    scaleDirection = 'decrease';
  } else if (increase && !decrease) {
    scaleCurrent = 3;
    scaleTarget = 8;
    scaleDirection = 'increase';
  } else if (decrease) {
    scaleCurrent = 7;
    scaleTarget = 3;
    scaleDirection = 'decrease';
  } else {
    scaleCurrent = 4;
    scaleTarget = 8;
    scaleDirection = 'increase';
  }
  const base = cleaned.replace(/\s+/g, ' ').trim() || 'Client will make measurable progress on this objective.';
  const objectiveOut = `${base} Progress will be measured on a 1–10 scale from a current level of ${scaleCurrent} to a target of ${scaleTarget}.`;
  return {
    objectiveText: objectiveOut,
    scaleCurrent,
    scaleTarget,
    scaleDirection,
    explanation: instruction
      ? 'Heuristic 1–10 rewrite applied using clinician instructions (AI unavailable).'
      : 'Heuristic 1–10 rewrite applied from wording (AI unavailable).',
    source: 'heuristic'
  };
}

/**
 * Use AI to rewrite an objective with explicit 1–10 current → target scales.
 * Falls back to a deterministic heuristic if Gemini fails or returns unusable JSON.
 */
export async function suggestObjectiveScaleRewrite(objectiveText, { clinicianInstructions = '' } = {}) {
  const text = stripPlanBoilerplateLabels(objectiveText);
  if (!text) return null;
  const instructions = String(clinicianInstructions || '').trim();

  const prompt = `You are a clinical treatment plan editor. Rewrite the treatment plan objective below so progress is measured on a 1–10 scale only, with explicit integer current and target ratings (each between 1 and 10, and they must differ).

Rules:
- The rewritten objective should be one or two clear sentences.
- Strip boilerplate labels like "Treatment Goal", "Treatment Strategy / Intervention", or "Intervention".
- Include the 1–10 current → target direction in plain language (e.g. "from a current level of 8 to a target of 4").
- Do not use percentages, frequency counts, or other measurement methods — the 1–10 scale is the measurement.
- Choose clinically reasonable numbers based on the original wording.
${instructions ? `- Clinician revision parameters (must honor):\n"""\n${instructions.slice(0, 2000)}\n"""` : ''}

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

  try {
    const gemini = await callGeminiText({
      prompt,
      temperature: 0.15,
      maxOutputTokens: 900
    });
    const parsed = parseJsonObject(gemini?.text);
    if (parsed) {
      const scaleCurrent = clampScale(parsed.scaleCurrent);
      const scaleTarget = clampScale(parsed.scaleTarget);
      const objectiveOut = stripPlanBoilerplateLabels(String(parsed.objectiveText || '').trim());
      if (objectiveOut && scaleCurrent != null && scaleTarget != null && scaleCurrent !== scaleTarget) {
        const scaleDirection =
          parsed.scaleDirection === 'increase' || parsed.scaleDirection === 'decrease'
            ? parsed.scaleDirection
            : inferScaleDirection(scaleCurrent, scaleTarget);
        return {
          objectiveText: objectiveOut,
          scaleCurrent,
          scaleTarget,
          scaleDirection,
          explanation: String(parsed.explanation || '').trim() || 'Suggested 1–10 scale from imported wording.',
          source: 'ai'
        };
      }
    }
    console.warn('[normalize-objective] AI response unusable; using heuristic fallback');
  } catch (err) {
    console.warn('[normalize-objective] AI failed; using heuristic fallback', err?.message || err);
  }

  return heuristicScaleRewrite(text, instructions);
}

/**
 * Suggest discharge criteria / planning when missing from an imported plan.
 */
export async function suggestDischargeCriteria({
  presentingProblem = '',
  diagnoses = [],
  goals = [],
  prescribedFrequency = ''
} = {}) {
  const dxLines = (diagnoses || [])
    .map((d) => [d.icd10Code || d.icd10_code, d.description].filter(Boolean).join(' — '))
    .filter(Boolean)
    .slice(0, 6);
  const goalLines = (goals || [])
    .map((g, i) => `G${i + 1}: ${stripPlanBoilerplateLabels(g.goalText || g.goal_text || '')}`)
    .filter((l) => l.length > 4)
    .slice(0, 6);

  const prompt = `You are a clinical treatment planner. Write concise Discharge Criteria / Planning for this outpatient treatment plan.

Rules:
- 2–4 sentences.
- Tie discharge to measurable progress on goals / reduced symptom burden and readiness for lower level of care.
- Do not invent diagnoses that are not listed.
- Plain clinical language; no markdown.

Context:
Presenting problem: ${String(presentingProblem || '').slice(0, 1200) || '(not provided)'}
Diagnoses: ${dxLines.join('; ') || '(not provided)'}
Goals: ${goalLines.join(' | ') || '(not provided)'}
Prescribed frequency: ${String(prescribedFrequency || '').slice(0, 200) || '(not provided)'}

Respond with JSON only:
{ "dischargePlan": "<text>", "explanation": "<one short sentence>" }`;

  try {
    const gemini = await callGeminiText({
      prompt,
      temperature: 0.2,
      maxOutputTokens: 600
    });
    const parsed = parseJsonObject(gemini?.text);
    const dischargePlan = String(parsed?.dischargePlan || '').trim();
    if (dischargePlan) {
      return {
        dischargePlan,
        explanation: String(parsed?.explanation || '').trim() || 'AI suggested discharge criteria.',
        source: 'ai'
      };
    }
  } catch (err) {
    console.warn('[suggest-discharge] AI failed; using heuristic fallback', err?.message || err);
  }

  const focus = goalLines[0]?.replace(/^G\d+:\s*/, '') || 'treatment goals';
  const dx = dxLines[0] || 'the identified diagnoses';
  return {
    dischargePlan:
      `Client will be considered for discharge when measurable progress is sustained on ${focus}, ` +
      `symptoms related to ${dx} are managed with reduced clinical intensity, and the client (and supports as applicable) ` +
      `demonstrate readiness for a lower level of care or routine community supports. ` +
      `A step-down or aftercare plan will be reviewed with the client prior to discharge.`,
    explanation: 'Heuristic discharge criteria drafted from available plan content (AI unavailable).',
    source: 'heuristic'
  };
}

export default { suggestObjectiveScaleRewrite, suggestDischargeCriteria };
