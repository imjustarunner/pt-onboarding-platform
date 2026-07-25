/**
 * Roles excluded from schedule coworker pickers (peer busy overlay, team meetings, etc.).
 * Aligns with /staff/coworkers — not guardians, school portal users, clients, or kiosk accounts.
 * Platform superadmins are included so operators can schedule meetings with each other.
 */
export const SCHEDULE_COWORKER_EXCLUDED_ROLES = Object.freeze([
  'client_guardian',
  'guardian',
  'school_staff',
  'school_support',
  'client',
  'parent',
  'kiosk'
]);

export function isPlatformSuperadminRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'super_admin' || r === 'superadmin';
}

export function isScheduleCoworkerRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return true;
  return !SCHEDULE_COWORKER_EXCLUDED_ROLES.includes(r);
}

export function isMeetingAttendeeEligible({
  attendeeRow,
  agencyId,
  actorRole,
  hostRole = null
} = {}) {
  if (!attendeeRow) return false;
  if (Number(attendeeRow?.in_agency || 0) === 1) return true;
  if (!agencyId) return false;
  const actorIsSuperAdmin = isPlatformSuperadminRole(actorRole) || isPlatformSuperadminRole(hostRole);
  const attendeeIsSuperAdmin = isPlatformSuperadminRole(attendeeRow?.role);
  return actorIsSuperAdmin && attendeeIsSuperAdmin;
}

export function scheduleCoworkerRoleSqlClause(columnExpr = 'u.role') {
  const placeholders = SCHEDULE_COWORKER_EXCLUDED_ROLES.map(() => '?').join(', ');
  return `LOWER(COALESCE(${columnExpr}, '')) NOT IN (${placeholders})`;
}

export function scheduleCoworkerRoleSqlParams() {
  return [...SCHEDULE_COWORKER_EXCLUDED_ROLES];
}
