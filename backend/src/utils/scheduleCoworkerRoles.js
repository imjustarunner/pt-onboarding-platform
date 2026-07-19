/**
 * Roles excluded from schedule coworker pickers (peer busy overlay, team meetings, etc.).
 * Aligns with /staff/coworkers — not guardians, school portal users, clients, or kiosk accounts.
 */
export const SCHEDULE_COWORKER_EXCLUDED_ROLES = Object.freeze([
  'client_guardian',
  'guardian',
  'school_staff',
  'school_support',
  'client',
  'parent',
  'kiosk',
  'super_admin',
  'superadmin'
]);

export function isScheduleCoworkerRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return true;
  return !SCHEDULE_COWORKER_EXCLUDED_ROLES.includes(r);
}

export function scheduleCoworkerRoleSqlClause(columnExpr = 'u.role') {
  const placeholders = SCHEDULE_COWORKER_EXCLUDED_ROLES.map(() => '?').join(', ');
  return `LOWER(COALESCE(${columnExpr}, '')) NOT IN (${placeholders})`;
}

export function scheduleCoworkerRoleSqlParams() {
  return [...SCHEDULE_COWORKER_EXCLUDED_ROLES];
}
