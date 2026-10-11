import { readFileSync } from 'node:fs';
const definition = JSON.parse(readFileSync(new URL('../content/evaluations/itsco-student-training-v1.json', import.meta.url), 'utf8'));
export const studentTrainingTemplate = () => structuredClone(definition);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Handbook text and the interactive form are generated from one versioned rubric.
// Only the blank definition belongs in a handbook; never evaluation responses.
export function studentTrainingAppendixHtml(template = definition) {
  return `<p>This appendix represents the student training evaluation completed in the app. Supervisors complete individual evaluations in Evaluations → Student training, or My Account → Evaluations. Completed records are private and do not appear in the handbook.</p><p>Form version ${template.version} · Quarterly evaluation · ${template.maxPoints} points possible.</p><h4>Purpose</h4><p>${escape(template.purpose)}</p><h4>Evaluation details</h4><p>Intern / trainee · Evaluator · Review year and quarter</p>`
    + template.sections.map(s => `<h4>${escape(s.title)} (${s.maxPoints} points)</h4><p>${escape(s.description)}</p><table><tbody>${s.bands.map(b => `<tr><th>${escape(b.label)} (${b.min}–${b.max} points)</th><td>${escape(b.description)}</td></tr>`).join('')}</tbody></table><p>Score: 0–${s.maxPoints}. Observations / development notes (optional).</p>`).join('')
    + `<h4>Overall evaluation</h4><p>Summary and next steps (optional). Total: ${template.maxPoints} points possible.</p><ul>${template.outcomes.map(o => `<li>${o.min}–${o.max} points: ${escape(o.description)}</li>`).join('')}</ul>`;
}

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function validateTrainingResponse(template, input, { complete = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Provide the evaluation responses.');
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(input.scores) || !object(input.notes)) fail('Provide scores and section notes.');
  const allowed = new Set(template.sections.map(s => s.key));
  if ([...Object.keys(input.scores), ...Object.keys(input.notes)].some(k => !allowed.has(k))) fail('The response contains an unknown evaluation category. Reload the form.');
  const text = value => {
    if (value == null) return '';
    if (typeof value !== 'string' || value.length > 4000) fail('Notes must contain no more than 4,000 characters.');
    return value.trim();
  };
  const scores = {}, notes = {};
  for (const s of template.sections) {
    const value = input.scores[s.key];
    if (value == null || value === '') { if (complete) fail(`Enter a score for ${s.title}.`); }
    else {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > s.maxPoints) fail(`Score ${s.title} between 0 and ${s.maxPoints} using a whole number.`);
      scores[s.key] = value;
    }
    notes[s.key] = text(input.notes[s.key]);
  }
  const total = Object.keys(scores).length === template.sections.length ? Object.values(scores).reduce((sum, n) => sum + n, 0) : null;
  return { response: { scores, notes, summary: text(input.summary), nextSteps: text(input.nextSteps) }, total, outcome: total == null ? null : template.outcomes.find(o => total >= o.min && total <= o.max)?.label || null };
}
