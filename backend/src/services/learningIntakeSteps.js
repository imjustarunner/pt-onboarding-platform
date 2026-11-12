import { tutoringIntakeSteps, isTutoringIntake, isValidEnrollmentEmail, TUTORING_AGREEMENT_KEY } from '../../../frontend/src/navigation/tutoringEnrollmentPolicy.js';
// Effective composition is shared with the browser; stored signed packets are
// never rewritten. Clinical enrollment follows its separate channel master.
export function learningIntakeSteps(steps = [], options = {}) {
  return tutoringIntakeSteps(steps, options);
}

export function validateTutoringIntakeSubmission(link, intakeData, guardianEmail) {
  if (!isTutoringIntake(link)) return;
  if (!isValidEnrollmentEmail(guardianEmail || intakeData?.guardian?.email)) throw Object.assign(new Error('Enter a valid guardian email address.'), { status: 400 });
  const responses = intakeData?.responses || intakeData || {};
  if ((link.intake_steps || []).some(step => step.id === 'tutoring_services_agreement') && responses.submission?.[TUTORING_AGREEMENT_KEY] !== true) throw Object.assign(new Error('Please review and accept the tutoring services agreement.'), { status: 400 });
}
