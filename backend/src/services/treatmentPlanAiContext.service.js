// Only predefined labels and validated numbers cross the AI boundary. Never serialize source text,
// names, database IDs, dates, demographics, quotations, diagnoses, or free-form provider requests.
const DOMAINS = [
  ['communication with your partner', /\b(?:wife|husband|spouse|partner)\b/i, /communicat|interaction|conflict/i],
  ['communication', /communicat|assertiv|conversation/i],
  ['anxiety management', /anxi|worry|worried|panic/i],
  ['mood', /depress|mood|sadness/i],
  ['coping with intrusive thoughts', /obsess|ruminat|intrusive/i],
  ['sleep', /sleep|insomnia/i],
  ['self-confidence', /self.confiden|self.esteem|self.doubt/i],
  ['coping with stress', /stress|coping|distress/i],
  ['emotion regulation', /anger|emotion|irritab|regulat/i],
  ['relationships', /relationship|social|family/i],
  ['daily routines', /routine|daily.function|self.care/i]
];
export function clinicalThemes(text) {
  return DOMAINS.filter(([, ...tests]) => tests.every((test) => test.test(String(text || '')))).map(([label]) => label);
}
export function safeScale(value) {
  const n = Number(value);
  return value != null && value !== '' && Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}
export function anonymousObjective(objective, ref) {
  return { ref: String(ref).replace(/[^0-9.]/g, ''), themes: clinicalThemes(objective.objective_text || objective.objectiveText),
    baseline: safeScale(objective.scale_start ?? objective.scaleStart ?? objective.scale_current ?? objective.scaleCurrent),
    current: safeScale(objective.scale_current ?? objective.scaleCurrent), target: safeScale(objective.scale_target ?? objective.scaleTarget) };
}
export function safeNoteSignals(sections = {}) {
  const signals = (text) => ({ themes: clinicalThemes(text), languageCues: [
    [/improv|progress|better/i, 'mentions improvement'], [/unchanged|no change|stagnan|no progress/i, 'mentions lack of change'],
    [/worsen|regress|deteriorat/i, 'mentions deterioration']
  ].filter(([pattern]) => pattern.test(String(text || ''))).map(([, label]) => label) });
  return { subjective: signals(sections.Subjective || sections['Symptom Description and Subjective Report']), objective: signals(sections.Objective || sections['Objective Content']) };
}
