import { ITSCO_EVALUATION_RUBRICS, RATING_SCALE } from '../seeds/itscoEmployeeEvaluationRubrics.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only form definitions are accepted here. Employee cycles, responses and names
// are never read into the handbook or its question-answering corpus.
export function employeeHandbookForms(templates) {
  const definitions = templates === undefined
    ? Object.values(ITSCO_EVALUATION_RUBRICS).map(t => ({ slug: t.slug, name: t.name, version: 1, rubric_json: t.rubric, is_supervisor_rubric: t.isSupervisorRubric }))
    : templates;
  return definitions.map(t => ({
    slug: t.slug, name: t.name, version: t.version,
    sectionSlug: `employee-self-assessment-${t.slug.replace(/_/g, '-')}`,
    isSupervisorRubric: !!t.is_supervisor_rubric,
    rubric: structuredClone(t.rubric_json)
  })).sort((a, b) => a.slug.localeCompare(b.slug));
}

export function employeeSelfAssessmentHtml(form) {
  const rubric = form.rubric;
  const scale = rubric.ratingScale?.length ? rubric.ratingScale : RATING_SCALE;
  return `<p>Blank employee self-assessment · ${escape(form.name)} · Form version ${escape(form.version)}.</p><p>Complete your assigned evaluation in My Account → Evaluations. Your assigned form depends on your role. Individual responses and review comments are private and do not appear in this appendix. Existing assignments retain the form version assigned to them.</p><h4>Scoring guide</h4><ul>${scale.map(s => `<li>${escape(s.value)} — ${escape(s.label)}</li>`).join('')}</ul>`
    + (rubric.sections || []).map(s => `<h4>${escape(s.title)}</h4>`
      + (s.criteria || []).map(c => `<h5>${escape(c.label)}</h5>${c.description ? `<p>${escape(c.description)}</p>` : ''}<table><thead><tr><th>Rating</th><th>Criteria</th></tr></thead><tbody>${scale.map(r => `<tr><th>${escape(r.value)} — ${escape(r.label)}</th><td>${escape(c.anchors?.[r.value] || '')}</td></tr>`).join('')}</tbody></table>`).join('')
      + (s.actionItemPrompt || s.hasActionItems !== false ? `<p>${escape(s.actionItemPrompt || 'Action items / development notes for this section')}</p>` : '')).join('')
    + ((rubric.reflectionPrompts || []).length ? `<h4>Reflection</h4><ul>${rubric.reflectionPrompts.map(p => `<li>${escape(p.prompt || p.label)}</li>`).join('')}</ul>` : '');
}
