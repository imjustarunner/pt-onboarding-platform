import { RATING_SCALE } from '../seeds/itscoEmployeeEvaluationRubrics.js';

export function validateJobEvaluationRubric(raw) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  const text = (value, label, max = 2000) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`Enter ${label} (up to ${max} characters).`);
    return value.trim();
  };
  const keys = new Set();
  const key = value => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value) || keys.has(value)) fail('Each section, criterion and reflection needs a unique key.');
    keys.add(value); return value;
  };
  if (!raw || !Array.isArray(raw.sections) || !raw.sections.length || raw.sections.length > 30) fail('Add between 1 and 30 rubric sections.');
  const sections = raw.sections.map(s => {
    if (!Array.isArray(s.criteria) || !s.criteria.length || s.criteria.length > 200) fail('Each section needs between 1 and 200 criteria.');
    return { key: key(s.key), title: text(s.title, 'a section title', 255), hasActionItems: s.hasActionItems !== false,
      criteria: s.criteria.map(c => ({ key: key(c.key), label: text(c.label, 'a criterion'),
        anchors: Object.fromEntries(RATING_SCALE.map(r => [r.value, text(c.anchors?.[r.value], `the ${r.label} description`)])) })) };
  });
  if (raw.reflectionPrompts != null && (!Array.isArray(raw.reflectionPrompts) || raw.reflectionPrompts.length > 30)) fail('Use up to 30 reflection questions.');
  return { title: text(raw.title, 'a rubric title', 255), ratingScale: RATING_SCALE, sections,
    reflectionPrompts: (raw.reflectionPrompts || []).map(p => ({ key: key(p.key), label: text(p.label, 'a reflection question') })) };
}
