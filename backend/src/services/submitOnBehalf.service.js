import pool from '../config/database.js';
import { EVENT_STAFF_ROLES_SQL } from '../utils/companyEventOperations.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function submitAgencyId(raw) {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Select an organization');
  return id;
}
export async function authorizeSubmitAdmin(actor, agencyId, db = pool) {
  if (!['admin', 'super_admin'].includes(actor?.role)) fail(403, 'Admin or superadmin access is required');
  const [rows] = await db.execute(`SELECT u.id FROM users u WHERE u.id = ?
    AND u.role IN ('admin','super_admin') AND u.is_active = 1 AND COALESCE(u.is_archived,0) = 0 AND u.terminated_at IS NULL
    AND (u.role = 'super_admin' OR EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id = u.id AND ua.agency_id = ? AND COALESCE(ua.is_active,1) = 1))`, [actor.id, agencyId]);
  if (!rows.length) fail(403, 'Admin access to this organization is required');
}
export async function submitEmployees(agencyId, userId = null, db = pool) {
  const [rows] = await db.execute(`SELECT DISTINCT u.id, u.first_name, u.last_name, u.role, u.timezone,
    u.is_hourly_worker, u.hourly_dual_rate_enabled, u.has_supervisor_privileges,
    u.medcancel_enabled, u.medcancel_rate_schedule, u.company_card_enabled,
    u.company_car_submit_access, u.company_car_manage_access, ua.has_department_access, ua.has_payroll_access
    FROM users u JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ? AND COALESCE(ua.is_active,1) = 1
    WHERE u.is_active = 1 AND COALESCE(u.is_archived,0) = 0 AND u.terminated_at IS NULL
      AND LOWER(u.role) IN (${EVENT_STAFF_ROLES_SQL})
      AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','TERMINATED_PENDING','PROSPECTIVE','PENDING_SETUP','PREHIRE_OPEN')
      ${userId == null ? '' : 'AND u.id = ?'} ORDER BY u.last_name, u.first_name, u.id`, userId == null ? [agencyId] : [agencyId, userId]);
  return rows.map(u => ({ ...u, firstName:u.first_name, lastName:u.last_name,
    isHourlyWorker:!!u.is_hourly_worker, hourlyDualRateEnabled:!!u.hourly_dual_rate_enabled,
    hasSupervisorPrivileges:!!u.has_supervisor_privileges, medcancelEnabled:!!u.medcancel_enabled,
    medcancelRateSchedule:u.medcancel_rate_schedule, companyCardEnabled:!!u.company_card_enabled,
    budgetSubmitAccess:u.role === 'super_admin' || !!u.has_department_access || !!u.has_payroll_access,
    companyCarSubmitAccess:!!u.company_car_submit_access, companyCarManageAccess:!!u.company_car_manage_access }));
}
export async function resolveSubmitEmployee({ actor, agencyId: rawAgencyId, userId: rawUserId, db = pool }) {
  const agencyId = submitAgencyId(rawAgencyId), userId = Number(rawUserId);
  if (!Number.isSafeInteger(userId) || userId <= 0) fail(400, 'Select an employee');
  await authorizeSubmitAdmin(actor, agencyId, db);
  const [employee] = await submitEmployees(agencyId, userId, db);
  if (!employee) fail(404, 'Active employee not found in this organization');
  return { agencyId, employee };
}
