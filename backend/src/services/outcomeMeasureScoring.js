import { scoreNluLearning } from './nluLearningScoring.js';
// Deterministic scoring only. Never derive diagnoses, billing codes, or treatment plans.
export const measureItemVisible = (item, answers) => (item.when || []).every(condition => {
  const key = condition.key === '$alcohol' ? `alcohol_${answers.alcohol_branch}` : condition.key;
  const value = answers[key];
  return condition.positive ? /^[1-4]$/.test(String(value)) : value === condition.equals;
});
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };

export function normalizeMeasureAnswers(measure, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Answers must be an object.');
  const known = new Set(measure.items.map(i => i.key));
  if (Object.keys(input).some(key => !known.has(key))) invalid('Unknown question in responses.');
  const answers = {};
  for (const item of measure.items) {
    const value = input[item.key];
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
    if (item.type === 'number') {
      if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < item.min || Number(value) > item.max) invalid('Enter a whole number within the listed range.');
      answers[item.key] = String(Number(value));
    } else if (item.type === 'text') {
      if (typeof value !== 'string' || value.length > 1500) invalid('Text responses must be at most 1,500 characters.');
      answers[item.key] = value.trim();
    } else {
      const choices = item.options.map(o => o.value);
      if (item.type === 'checkboxes') {
        if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !choices.includes(v)) || new Set(value).size !== value.length) invalid('Invalid event response.');
        if (value.includes('5') && value.length > 1) invalid('Doesn’t apply cannot be combined with an exposure response.');
        answers[item.key] = [...value];
      } else {
        if (typeof value !== 'string' || !choices.includes(value)) invalid('Select one of the listed response options.');
        answers[item.key] = value;
      }
    }
  }
  // Drop stale answers from branches that have become hidden; never score hidden input.
  for (const item of measure.items) if (!measureItemVisible(item, answers)) delete answers[item.key];
  return answers;
}

export function scoreOutcomeMeasure(measure, input) {
  const answers = normalizeMeasureAnswers(measure, input);
  const required = measure.items.filter(i => !i.optional && measureItemVisible(i, answers));
  const missing = required.filter(i => answers[i.key] == null || answers[i.key] === '').map(i => i.key);
  const result = { complete: missing.length === 0, missing, answered: required.length - missing.length,
    required: required.length, total: null, average: null, domains: {}, flags: [], interpretation: '', prorated: false };
  if (measure.kind === 'original_pilot') return scoreNluLearning(measure, answers, result);
  const numeric = measure.items.filter(i => /^q\d+$/.test(i.key));
  const rawSum = numeric.reduce((sum, item) => sum + (answers[item.key] == null ? 0 : Number(answers[item.key])), 0);
  if (measure.id === 'phq-9') {
    if (Number(answers.q9) > 0) result.flags.push({ key: 'safety_follow_up', urgent: true, text: 'PHQ-9 item 9 was endorsed. Complete a direct suicide/self-harm assessment and follow the agency safety procedure now. The total score does not determine safety.' });
    else if (answers.q9 == null) result.flags.push({ key: 'safety_unanswered', urgent: false, text: 'PHQ-9 item 9 is unanswered. Safety has not been assessed by this response set; follow up directly.' });
  }
  if (measure.id === 'lec-5') {
    result.interpretation = 'Exposure inventory only. No validated total or severity score; review individual events clinically.';
    return { answers, result };
  }
  if (measure.id === 'ftnd' && answers.current_smoking !== '1') {
    result.interpretation = answers.current_smoking === '0'
      ? 'Not applicable: current cigarette smoking was not reported. No dependence score calculated.'
      : 'Current cigarette smoking is unanswered. No dependence score calculated.';
    return { answers, result };
  }
  if (measure.id === 'taps') {
    const groups = { tobacco: 'tobacco', alcohol: `alcohol_${answers.alcohol_branch}`, marijuana: 'drugs', stimulants: 'drugs', heroin: 'drugs', opioids: 'prescription', sedatives: 'prescription', adhd: 'prescription', other: 'drugs' };
    for (const [group, parent] of Object.entries(groups)) {
      if (answers[parent] == null) { result.domains[group] = null; continue; }
      if (answers[parent] === '0') { result.domains[group] = 0; continue; }
      const items = measure.items.filter(i => i.key.startsWith(`${group}_`) && i.section?.startsWith('Part 2') && i.type === 'radio' && measureItemVisible(i, answers));
      result.domains[group] = !items.length || items.some(i => answers[i.key] == null) ? null : items.reduce((n, i) => n + Number(answers[i.key]), 0);
    }
    result.interpretation = 'Review each substance separately. Scores of 1 suggest problem use; 2 or more suggest higher risk requiring assessment. The other-drug item is an unvalidated follow-up flag, not a substance-use-disorder score. No combined total is calculated.';
    if (answers.other_0 === '1') result.flags.push({ key: 'other_substance', urgent: false, text: 'Other substance use reported: review the named substances; no validated risk threshold is assigned to this item.' });
    if (!result.complete) result.interpretation += ' This administration is incomplete; null domain scores cannot be interpreted.';
    return { answers, result };
  }
  if (!result.complete && !(measure.id === 'des-b' && missing.length <= 2)) {
    result.interpretation = 'Incomplete responses. No total or severity band calculated; unanswered items are not treated as zero.';
    return { answers, result };
  }
  result.total = rawSum;
  if (measure.id === 'aware') {
    result.total = numeric.reduce((sum, item, i) => sum + ([8,14,20,24,26].includes(i + 1) ? 8 - Number(answers[item.key]) : Number(answers[item.key])), 0);
    result.interpretation = 'Higher scores indicate more alcohol relapse warning signs. Review alongside the clinical history; this is not a personalized probability of relapse.';
  } else if (measure.id === 'des-b') {
    result.prorated = !result.complete;
    if (result.prorated) result.total = Math.round(rawSum * 8 / (8 - missing.length));
    result.average = result.total / 8;
    result.interpretation = `${result.prorated ? 'Prorated total (1–2 unanswered items); ' : ''}higher total and average indicate greater reported dissociative symptom severity. Review the items with the client.`;
  } else if (measure.id === 'phq-9' || measure.id === 'gad-7') {
    const thresholds = measure.id === 'phq-9' ? [5,10,15,20] : [5,10,15];
    const bands = measure.id === 'phq-9' ? ['Minimal','Mild','Moderate','Moderately severe','Severe'] : ['Minimal','Mild','Moderate','Severe'];
    result.band = bands[thresholds.filter(n => result.total >= n).length];
    result.interpretation = `${result.band} symptom range. Screening result only; clinical assessment determines diagnosis and next steps.`;
  } else if (measure.id === 'pcl-5') {
    for (const [key, from, to] of [['Intrusion',1,5],['Avoidance',6,7],['Mood and cognition',8,14],['Arousal and reactivity',15,20]]) {
      result.domains[key] = Array.from({ length: to - from + 1 }, (_, i) => Number(answers[`q${from + i}`])).reduce((a,b) => a+b,0);
    }
    result.interpretation = 'Higher scores indicate greater PTSD symptom burden. Establish trauma exposure and interpret in the clinical context; this total does not establish PTSD.';
  } else if (measure.id === 'cage-aid') result.interpretation = result.total >= 1 ? 'Positive screen: further substance-use assessment indicated. Not a diagnosis.' : 'No items endorsed. A negative screen does not rule out substance-use concerns.';
  else if (measure.id === 'ftnd') result.interpretation = 'Higher scores indicate greater cigarette dependence. This score does not assess vaping or prescribe medication.';
  return { answers, result };
}
