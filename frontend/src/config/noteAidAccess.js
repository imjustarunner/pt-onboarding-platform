/**
 * Note Aid / Tools & Aids access — shared across dashboard, router, and quick nav.
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
  'facilitator',
  'school_staff'
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
