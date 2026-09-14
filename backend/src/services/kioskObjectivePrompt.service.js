import { callGeminiText } from './geminiText.service.js';
import { anonymousObjective, clinicalThemes } from './treatmentPlanAiContext.service.js';

export function defaultClientKioskPrompt(obj = {}) {
  const theme = clinicalThemes(obj.objective_text || obj.objectiveText)[0] || 'progress toward this goal';
  return `How would you rate your ${theme} on a scale of 1–10 since your last session?`;
}
export function defaultOtherKioskPrompt(obj = {}) {
  return defaultClientKioskPrompt(obj).replace('your ', 'the client’s ').replace('your last session', 'the last session');
}
export function verifiedObjectiveQuestion(objective, other = false) {
  const field = other ? 'kiosk_prompt_other' : 'kiosk_prompt';
  return objective?.[`${field}_verified_at`] && objective?.[`${field}_verified_by`] ? String(objective[field] || '').trim() : '';
}
export async function fillEmptyKioskPrompts({ objectives = [], generate = callGeminiText }) {
  const need = objectives.filter((o) => !o.kiosk_prompt || !o.kiosk_prompt_other);
  let items = [];
  if (need.length) {
    const safe = need.map((o, index) => anonymousObjective(o, index + 1));
    try {
      const { text } = await generate({ prompt: `Write natural, short therapy check-in questions. Ask the person directly, without copying a clinical objective. Each question must ask for a 1–10 rating. Match the scale direction and explain anchors briefly when known. Never assume that high scores are better. For partner communication, for example: "How would you rate your communication with your partner on a scale of 1–10?" The other question asks a guardian about the client, without names. Return JSON {"items":[{"ref":"1","client":"...","other":"..."}]}. Anonymous objective categories and scales:\n${JSON.stringify(safe)}`, temperature: 0.2, maxOutputTokens: Math.max(1600, need.length * 220) });
      const parsed = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch { /* Keep editable, unverified suggestions available if AI is unavailable. */ }
  }
  return objectives.map((o) => {
    const ref = String(need.indexOf(o) + 1);
    const ai = items.find((item) => String(item.ref) === ref) || {};
    return { id: o.id, kiosk_prompt: o.kiosk_prompt || String(ai.client || defaultClientKioskPrompt(o)).slice(0, 500), kiosk_prompt_other: o.kiosk_prompt_other || String(ai.other || defaultOtherKioskPrompt(o)).slice(0, 500) };
  });
}
