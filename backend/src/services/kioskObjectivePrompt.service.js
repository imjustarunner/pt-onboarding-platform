import { callGeminiText } from './geminiText.service.js';

function clampPrompt(text, fallback) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return (t || fallback).slice(0, 500);
}

export function defaultClientKioskPrompt(obj = {}) {
  const text = String(obj.objective_text || obj.objectiveText || 'this treatment goal').trim().slice(0, 180);
  const target = Number(obj.scale_target ?? obj.scaleTarget);
  const highIsBetter = !Number.isFinite(target) || target >= 5.5;
  const ten = highIsBetter ? 'at or closest to your goal' : 'farthest from your goal';
  const one = highIsBetter ? 'farthest from your goal' : 'at or closest to your goal';
  return `On a scale of 1–10, with 10 being ${ten} and 1 being ${one}, how would you rate yourself since the last session for: ${text}`;
}

export function defaultOtherKioskPrompt(obj = {}, clientName = 'the client') {
  const who = String(clientName || 'the client').trim() || 'the client';
  const text = String(obj.objective_text || obj.objectiveText || 'this treatment goal').trim().slice(0, 180);
  const target = Number(obj.scale_target ?? obj.scaleTarget);
  const highIsBetter = !Number.isFinite(target) || target >= 5.5;
  const ten = highIsBetter ? 'at or closest to their goal' : 'farthest from their goal';
  const one = highIsBetter ? 'farthest from their goal' : 'at or closest to their goal';
  return `On a scale of 1–10, with 10 being ${ten} and 1 being ${one}, how would you rate ${who} since the last session for: ${text}`;
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Fill empty kiosk prompts only. Existing saved questions are kept (re-enable must not regenerate).
 */
export async function fillEmptyKioskPrompts({ clientName, objectives = [] }) {
  const who = String(clientName || 'the client').trim() || 'the client';
  const need = (objectives || []).filter((o) => {
    const clientEmpty = !String(o.kiosk_prompt || '').trim();
    const otherEmpty = !String(o.kiosk_prompt_other || '').trim();
    return clientEmpty || otherEmpty;
  });
  if (!need.length) {
    return (objectives || []).map((o) => ({
      id: o.id,
      kiosk_prompt: String(o.kiosk_prompt || '').trim() || null,
      kiosk_prompt_other: String(o.kiosk_prompt_other || '').trim() || null
    }));
  }

  let byId = new Map();
  try {
    const prompt = `Write short kiosk rating questions for a therapy session. Return JSON only:
{"items":[{"id":123,"client":"...","other":"..."}]}
Rules:
- "client" is first person, asked of the client ("how would you rate yourself…").
- "other" is third person about ${who} (guardian/teacher), never first person.
- Each question is one sentence, under 280 characters, mentions the objective in plain language.
- Scale is always 1–10.
Objectives:
${need.map((o) => `- id ${o.id}: ${String(o.objective_text || '').slice(0, 200)}`).join('\n')}`;

    const gemini = await callGeminiText({
      prompt,
      temperature: 0.2,
      maxOutputTokens: 1200
    });
    const parsed = parseJsonObject(gemini?.text);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    for (const item of items) {
      const id = Number(item?.id || 0);
      if (!id) continue;
      byId.set(id, {
        client: String(item.client || '').trim(),
        other: String(item.other || '').trim()
      });
    }
  } catch {
    byId = new Map();
  }

  return (objectives || []).map((o) => {
    const existingClient = String(o.kiosk_prompt || '').trim();
    const existingOther = String(o.kiosk_prompt_other || '').trim();
    const ai = byId.get(Number(o.id)) || {};
    return {
      id: o.id,
      kiosk_prompt: existingClient || clampPrompt(ai.client, defaultClientKioskPrompt(o)),
      kiosk_prompt_other: existingOther || clampPrompt(ai.other, defaultOtherKioskPrompt(o, who))
    };
  });
}
