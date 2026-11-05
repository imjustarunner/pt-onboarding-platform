import { restyleAbsenceLetter } from './dayAbsenceNarrative.service.js';

const TONES = new Set(['regenerate', 'warmer', 'formal', 'shorter', 'longer']);
const fail = message => Object.assign(new Error(message), { status: 400 });

function acceptable(source, candidate) {
  const text = String(candidate || '').trim();
  if (!text || text.length > 6000) return false;
  if (!/911/.test(source) || /911/.test(text)) {
    if (!/988/.test(source) || /988/.test(text)) {
      const addedReturn = /return|back on|see you/i.test(text) && !/return|back on|see you/i.test(source);
      const addedReschedule = /reschedul/i.test(text) && !/reschedul/i.test(source);
      return !addedReturn && !addedReschedule;
    }
  }
  return false;
}

export async function rewriteAbsenceLetter({ text, tone = 'regenerate', audience = 'guardian' }, overrides = {}) {
  const source = String(text || '').trim();
  if (!source || source.length > 6000) throw fail('Review the letter before rewriting it.');
  if (!TONES.has(tone)) throw fail('Choose a rewrite style.');
  const local = restyleAbsenceLetter(source, tone === 'regenerate' ? 'warmer' : tone);
  const generate = overrides.generateText || (async options => {
    try { return await (await import('./geminiText.service.js')).callGeminiText(options); }
    catch { return ''; }
  });
  let model = '';
  try {
    model = await generate({
      temperature: 0.4, maxOutputTokens: 700, sensitive: false,
      systemInstruction: 'Rewrite one care-team absence email. Keep every name, date, school, and the 911 and 988 sentence. Do not add a return date or any rescheduling offer unless that exact idea is already in the letter. Do not invent clinical details.',
      prompt: `Audience: ${audience}. Style: ${tone}. Letter:\n${source}`
    });
  } catch { model = ''; }
  const candidate = String(model || '').trim();
  return { text: acceptable(source, candidate) ? candidate : local };
}
