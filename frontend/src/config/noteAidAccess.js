import { BUSINESS_TYPE_ALIASES, DEFAULT_BUSINESS_TYPES_BY_ORG_TYPE } from './businessTypeCapabilities.js';

/**
 * Documentation Hub / Tools & Aids access — shared across dashboard, router, and quick nav.
 * Employee roles only (excludes client / client_guardian).
 */
export const NOTE_AID_EMPLOYEE_ROLES = [
  'super_admin',
  'admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'supervisor',
  'clinical_practice_assistant',
  'intern',
  'intern_plus',
  'facilitator'
];

export function isNoteAidEmployeeRole(role) {
  return NOTE_AID_EMPLOYEE_ROLES.includes(String(role || '').toLowerCase());
}

export function isTruthyFeatureFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function isNoteAidEnabledForAgencyFlags(flags) {
  const f = flags || {};
  if (f.noteAidEnabled === false && f.clinicalNoteGeneratorEnabled === false) return false;
  return true;
}

/** Employee workspace paths (not admin-only — all NOTE_AID_EMPLOYEE_ROLES). */
export const WORKSPACE_TOOLS_AIDS_PATH = '/tools-aids';
export const WORKSPACE_NOTE_AID_PATH = '/note-aid';

export function workspaceToolsAidsPath(orgSlug = '') {
  const slug = String(orgSlug || '').trim();
  return slug ? `/${slug}${WORKSPACE_TOOLS_AIDS_PATH}` : WORKSPACE_TOOLS_AIDS_PATH;
}

export function workspaceNoteAidPath(orgSlug = '') {
  const slug = String(orgSlug || '').trim();
  return slug ? `/${slug}${WORKSPACE_NOTE_AID_PATH}` : WORKSPACE_NOTE_AID_PATH;
}

const PRACTICE_NOTE_ROLES = new Set([
  'provider',
  'provider_plus',
  'supervisor',
  'clinical_practice_assistant',
  'intern',
  'intern_plus',
  'clinician'
]);

const CLINICAL_FEATURE_FLAGS = [
  'clinicalChartEnabled',
  'clinicalNoteSigningEnabled',
  'medicalBillingEnabled',
  'medicalClaimsEnabled'
];

function normalizeBusinessType(value) {
  const raw = String(value || '').trim().toLowerCase();
  return BUSINESS_TYPE_ALIASES[raw] || raw;
}

function tenantBusinessTypes(tenant) {
  const list = tenant?.business_types
    || tenant?.businessTypes
    || tenant?.enabled_business_types
    || tenant?.enabledBusinessTypes;
  const rows = Array.isArray(list) ? list : (list ? [list] : []);
  const explicit = rows
    .filter((row) => row?.is_enabled !== false && row?.isEnabled !== false)
    .map((row) => normalizeBusinessType(row?.business_type || row?.businessType || row))
    .filter(Boolean);
  if (explicit.length) return explicit;

  const singular = normalizeBusinessType(tenant?.business_type || tenant?.businessType);
  if (singular) return [singular];

  const orgType = String(tenant?.organization_type || tenant?.organizationType || '').trim().toLowerCase();
  return (DEFAULT_BUSINESS_TYPES_BY_ORG_TYPE[orgType] || []).map(normalizeBusinessType).filter(Boolean);
}

/** True when the selected tenant represents a mental-health / clinical practice. */
export function isMentalHealthPractice(tenant = null) {
  if (!tenant) return false;
  if (tenantBusinessTypes(tenant).some((type) => type === 'mental_health')) return true;
  const rawFlags = tenant?.feature_flags || tenant?.featureFlags || {};
  let flags = rawFlags;
  if (typeof rawFlags === 'string') {
    try { flags = JSON.parse(rawFlags) || {}; } catch { flags = {}; }
  }
  return CLINICAL_FEATURE_FLAGS.some((key) => isTruthyFeatureFlag(flags?.[key]));
}

/**
 * Visible name for the shared note surface. AuricWell is always clinical; elsewhere
 * only provider-facing clinical tenants receive the clinical name.
 */
export function noteAidWorkspaceLabel({ role = '', tenant = null, auricwell = false } = {}) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (auricwell || (PRACTICE_NOTE_ROLES.has(normalizedRole) && isMentalHealthPractice(tenant))) {
    return 'Practice Notes';
  }
  return 'Notes Workspace';
}
