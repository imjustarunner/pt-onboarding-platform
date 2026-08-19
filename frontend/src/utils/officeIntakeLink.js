/**
 * Office in-depth client packets vs other agency-scoped public forms.
 *
 * Job applications, medical-records requests, etc. are also scope_type=agency.
 * Never infer "office counseling intake" from agency scope alone — use form_type.
 * Keep in sync with backend/src/utils/officeIntakeLink.js.
 */

export const NON_CLIENT_INTAKE_FORM_TYPES = new Set([
  'job_application',
  'medical_records_request',
  'internal_preferences',
  'life_balance_wheel',
  'smart_school_roi',
  'smart_disclosure',
  'smart_registration'
]);

function formTypeOf(link) {
  return String(link?.form_type || link?.formType || '').trim().toLowerCase();
}

export function isNonClientIntakeFormType(formType) {
  return NON_CLIENT_INTAKE_FORM_TYPES.has(String(formType || '').trim().toLowerCase());
}

export function linkLooksLikeOfficeIntake(link) {
  if (!link) return false;
  if (isNonClientIntakeFormType(formTypeOf(link))) return false;
  if (Number(link.inherits_school_master || link.inheritsSchoolMaster || 0) === 1) return false;
  const scope = String(link.scope_type || link.scopeType || '').toLowerCase();
  if (scope === 'school') return false;
  return Number(link.inherits_office_master || link.inheritsOfficeMaster || 0) === 1
    || scope === 'agency';
}

export function looksLikeOfficeIntakeFromRoute({ link = null, publicKey = '' } = {}) {
  if (link) return linkLooksLikeOfficeIntake(link);
  return String(publicKey || '').toLowerCase().includes('office-intake');
}
