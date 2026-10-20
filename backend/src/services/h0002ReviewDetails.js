import { scorePsc17, suggestScreeningOutcome } from './h0002ScreeningRules.js';
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function screeningLocation(source, input = {}) {
  const code = input.placeOfService || (source.packetMethod === 'paper' && source.clientType === 'school' ? '03' : '10');
  const label = { '03': source.schoolName ? `School — ${source.schoolName}` : 'School', '10': 'Virtual — client’s home', '11': 'Office', '02': 'Virtual — outside the client’s home' }[code];
  if (!label) fail('Choose a supported client service location.');
  return { code, label };
}
export function screeningPresentingProblem(input) {
  return [String(input.presentingProblem || '').trim(), input.safetyConcern?.trim() ? `**Reported safety concern: ${input.safetyConcern.trim()}**` : ''].filter(Boolean).join('\n\n');
}
export function validateScreeningDraft(input, source) {
  if (input.sourceHash !== source.sourceHash) throw Object.assign(new Error('The source questionnaire changed. Reopen it before saving.'), { status: 409 });
  const result = { sourceHash: source.sourceHash };
  for (const key of ['outcome','assessment','followUp','presentingProblem','safetyConcern','placeOfService']) {
    if (input[key] != null && (typeof input[key] !== 'string' || input[key].length > 10000)) fail(`Invalid ${key}.`);
    result[key] = input[key] || '';
  }
  result.paperTranscription = input.paperTranscription === true;
  result.paperResponses = {};
  const keys = new Set([...(source.pscItems || []).map(i => i.key), ...(source.clinicalFields || []).map(i => i.key)]);
  for (const [key, value] of Object.entries(input.paperResponses || {})) {
    if (!keys.has(key) || !['string','number','boolean'].includes(typeof value) || String(value).length > 10000) fail('Invalid paper response.');
    if (/^psc_/.test(key) && value !== '' && ![0,1,2].includes(value)) fail('Select Never, Sometimes or Often for each PSC-17 item.');
    result.paperResponses[key] = value;
  }
  return result;
}
export function applyScreeningTranscription(source, input) {
  if (!input.paperTranscription) return { ...source, safetyFlag: source.safetyFlag || !!String(input.safetyConcern || '').trim() };
  validateScreeningDraft(input, source);
  const values = input.paperResponses || {};
  const items = source.pscItems.map(item => ({ ...item, score: Number.isInteger(values[item.key]) ? values[item.key] : null }));
  const psc = scorePsc17(items, new Map(source.pscItems.map(i => [i.key, i])));
  const lines = source.clinicalFields.map(field => `${field.label}: ${values[field.key] ?? 'Not transcribed'}`);
  const safetyFlag = source.safetyFlag || !!String(input.safetyConcern || '').trim() || Object.entries(values).some(([key,value]) => /harm|suicid|abuse|neglect/i.test(key) && /^(yes|sí|si|true|1)$/i.test(String(value)));
  return { ...source, psc, safetyFlag, reportedConcerns: true, suggestedOutcome: suggestScreeningOutcome(psc),
    summary: ['Paper packet transcription — reviewed against the source by the clinician.', ...items.map(i => `${i.label}: ${i.score == null ? 'Unanswered' : ['Never','Sometimes','Often'][i.score]}`), ...lines].join('\n') };
}
