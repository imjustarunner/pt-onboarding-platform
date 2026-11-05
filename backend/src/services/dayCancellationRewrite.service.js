import { restyleAbsenceLetter } from './dayAbsenceNarrative.service.js';

const TONES = new Set(['regenerate', 'warmer', 'formal', 'shorter', 'longer']);
const fail = message => Object.assign(new Error(message), { status: 400 });

function acceptable(source, candidate) {
  const text = String(candidate || '').trim();
  if (!text || text.length > 6000) return false;
  const added = pattern => pattern.test(text) && !pattern.test(source);
  return !added(/return|back on|see you/i) && !added(/reschedul/i) && !added(/911|988|crisis|emergency/i);
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
      systemInstruction: 'Rewrite one care-team absence email. Keep every name, date, and school. Do not add a return date, rescheduling offer, or emergency or crisis line unless that exact idea is already in the letter. Do not invent clinical details.',
      prompt: `Audience: ${audience}. Style: ${tone}. Letter:\n${source}`
    });
  } catch { model = ''; }
  const candidate = String(model || '').trim();
  return { text: acceptable(source, candidate) ? candidate : local };
}
