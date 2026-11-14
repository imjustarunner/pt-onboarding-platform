// Shared by the public form and server. Apply only to academic tutoring;
// separately selected clinical services retain their own enrollment requirements.
import {TUTORING_ENROLLMENT_VERSION,tutoringAgreementSections,tutoringOptionalReleaseSteps} from './tutoringEnrollmentAgreement.js';
export const LEGACY_TUTORING_AGREEMENT_KEY='tutoring_service_agreement_2026_11_12';
export const TUTORING_AGREEMENT_KEY = 'tutoring_service_agreement_2026_11_13';
const clinicalTypes = new Set(['clinical_questions', 'smart_disclosure', 'disclosure', 'packet_informed_group_consent', 'packet_policy_services', 'packet_hipaa_notice', 'school_roi', 'guardian_waiver', 'guardian_waivers', 'demographics']);
const clinicalTitle = /\b(?:hipaa|psychotherapy|mental.health|group counseling|informed consent.*counseling|disclosure statement)\b/i;
const optionalDetails = /(?:guardian|parent).*?(?:dob|birth)|emergency.*phone|(?:address|street|postal|zip)|(?:^|_)(?:sex|gender)(?:_|$)/i;
export function isTutoringIntake(link) { return String(link?.master_channel || '').toLowerCase() === 'tutoring'; }
export function isValidEnrollmentEmail(value) {
  const email = String(value || '').trim();
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64 || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')) return false;
  return parts[1].split('.').length > 1 && parts[1].split('.').every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)) && /^[A-Za-z]{2,63}$/.test(parts[1].split('.').at(-1));
}
export function tutoringIntakeSteps(steps = [], { locale = 'en' } = {}) {
  const spanish = String(locale).startsWith('es');
  const kept = (Array.isArray(steps) ? steps : []).filter(Boolean).filter(step => {
    const id = String(step.id || '');
    return !id.startsWith('counseling_') && !clinicalTypes.has(step.type) && step.serviceContext !== 'clinical'
      && !clinicalTitle.test(`${step.label || ''} ${step.title || ''}`) && id !== 'office_package_selection'
      && !['tutoring_services_agreement','tutoring_optional_media_release','tutoring_optional_school_release'].includes(id) && !/custody/i.test(id);
  }).map(step => {
    if (['insurance', 'insurance_info', 'payment_collection'].includes(step.type)) return { ...step, type: step.type === 'insurance' ? 'insurance_info' : step.type, paymentOnly: true, paymentRequired: false, enrollmentService: 'tutoring', label: spanish ? 'Preferencias de pago' : 'Payment preferences' };
    if (!Array.isArray(step.fields)) return { ...step };
    return { ...step, fields: step.fields.filter(field => !field.instrument && !/^(?:psc|phq|gad|asq|cssrs|crai?fft|vanderbilt|scared)_/i.test(field.key || '')).map(field => {
      if (!optionalDetails.test(field.key || '')) return { ...field };
      const value = { ...field, required: false, optional: true };
      if (/(?:^|_)(?:sex|gender)(?:_|$)/i.test(field.key || '')) {
        value.label = spanish ? 'Género (opcional)' : 'Gender (optional)';
        value.options = [ ['female', 'Female', 'Femenino'], ['male', 'Male', 'Masculino'], ['nonbinary', 'Nonbinary', 'No binario'], ['self_described', 'Self-described', 'Otra descripción'], ['prefer_not_to_say', 'Prefer not to say', 'Prefiero no responder'] ].map(([value, en, es]) => ({ value, label: spanish ? es : en }));
      }
      return value;
    }) };
  }).filter(step => !['questions'].includes(step.type) || step.id === 'learning-enrollment' || !Array.isArray(step.fields) || step.fields.length);
  if (!kept.some(step => step.type === 'provider_match')) {
    const billingIndex = kept.findIndex(step => ['insurance_info', 'payment_collection'].includes(step.type));
    kept.splice(billingIndex < 0 ? kept.length : billingIndex, 0, { id: 'tutoring_provider_preference', type: 'provider_match', label: spanish ? 'Elegir tutor (opcional)' : 'Choose a tutor (optional)', visibility: 'always', fields: [] });
  }
  const agreement = {
    id: 'tutoring_services_agreement', type: 'questions', scope: 'submission', audience: 'all', visibility: 'always',
    label: spanish ? 'Acuerdo de inscripción y políticas familiares de tutoría' : 'Tutoring Enrollment Agreement & Family Policies',
    version:TUTORING_ENROLLMENT_VERSION,
    fields: [{ id: TUTORING_AGREEMENT_KEY, key: TUTORING_AGREEMENT_KEY, type: 'checkbox', scope: 'submission', required: true,
      uiLabel:spanish?'He leído y acepto este acuerdo de tutoría.':'I have read and agree to this tutoring agreement.',
      agreementSections:tutoringAgreementSections(locale),agreementVersion:TUTORING_ENROLLMENT_VERSION,
      label:tutoringAgreementSections(locale).map(([title,body])=>`${title}\n${body}`).join('\n\n'),
      helperText:tutoringAgreementSections(locale).map(([title,body])=>`${title}\n${body}`).join('\n\n') }]
  };
  return [...kept, agreement,...tutoringOptionalReleaseSteps(locale)];
}
