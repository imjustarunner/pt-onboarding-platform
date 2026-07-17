/**
 * Audience rules for chat presence / DM directories.
 *
 * Direct Messages (1:1) are available broadly.
 * Channels / "chats" (group collaboration) are team-only (Phase 3+) — school_staff never join those.
 */

/** Internal team employees shown by default in Messages DM directory. */
export const TEAM_EMPLOYEE_ROLES = [
  'admin',
  'super_admin',
  'support',
  'staff',
  'assistant_admin',
  'supervisor',
  'facilitator',
  'intern',
  'clinical_practice_assistant',
  'provider_plus',
  'provider'
];

/** Roles that can toggle beyond the default team list. */
export const DIRECTORY_TOGGLE_ROLES = [
  'admin',
  'super_admin',
  'support',
  'clinical_practice_assistant'
];

/** Portal / external roles excluded from the default team list. */
export const NON_TEAM_DIRECTORY_ROLES = [
  'school_staff',
  'client_guardian',
  'kiosk',
  'club_manager'
];

export const DIRECTORY_ROLE_FILTERS = [
  'school_staff',
  'provider',
  'provider_plus',
  'client_guardian',
  'club_manager'
];

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function isTeamEmployeeRole(role) {
  return TEAM_EMPLOYEE_ROLES.includes(normalizeRole(role));
}

export function canToggleDirectoryAudience(role) {
  return DIRECTORY_TOGGLE_ROLES.includes(normalizeRole(role));
}

export function isSchoolStaffRole(role) {
  return normalizeRole(role) === 'school_staff';
}

export function normalizeAudience(raw, viewerRole) {
  const v = String(raw || 'team').trim().toLowerCase();
  if (isSchoolStaffRole(viewerRole)) return 'school';
  if (v === 'directory' || v === 'others' || v === 'external') return 'directory';
  return 'team';
}

export function normalizeRoleFilter(raw) {
  const r = normalizeRole(raw);
  if (!r || r === 'all') return null;
  if (DIRECTORY_ROLE_FILTERS.includes(r) || TEAM_EMPLOYEE_ROLES.includes(r)) return r;
  return null;
}
