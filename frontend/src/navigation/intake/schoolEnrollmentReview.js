export function withSchoolEnrollmentReview(steps, { school, standalone = false, locale = 'en' } = {}) {
  if (!school || standalone || !steps.length) return steps;
  return [...steps, { id: 'school_enrollment_review', type: 'school_review', label: locale === 'es' ? 'Revisar inscripción' : 'Review enrollment' }];
}
export function pscReviewStatus(answers = {}, locale = 'en') {
  const count = Array.from({length: 17}, (_, i) => answers[`psc_${i + 1}`]).filter(value => value !== null && value !== undefined && String(value).trim() !== '').length;
  if (count === 17) return locale === 'es' ? 'PSC-17 completo' : 'PSC-17 complete';
  if (count) return locale === 'es' ? `PSC-17: ${count} de 17 respuestas` : `PSC-17: ${count} of 17 answered`;
  return locale === 'es' ? 'PSC-17 sin respuestas registradas' : 'PSC-17 no answers recorded';
}
