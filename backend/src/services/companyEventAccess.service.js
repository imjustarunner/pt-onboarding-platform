import pool from '../config/database.js';
import { userHasAgencyOrAffiliatedOrgAccessForRequest } from '../utils/userAgencyAffiliationAccess.js';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export async function userHasAgencyAccessForRequest(req, agencyId) {
  if (!agencyId) return false;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  return userHasAgencyOrAffiliatedOrgAccessForRequest(req, agencyId);
}

export async function getProgramCoordinatorAccess(userId) {
  const uid = parsePositiveInt(userId);
  if (!uid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT has_skill_builder_coordinator_access FROM users WHERE id = ? LIMIT 1`,
      [uid]
    );
    const v = rows?.[0]?.has_skill_builder_coordinator_access;
    return v === true || v === 1 || v === '1';
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

/** Admin/staff/support or program coordinator — may edit event configuration & roster workflow. */
export async function canManageProgramEvent(req, agencyId) {
  if (!(await userHasAgencyAccessForRequest(req, agencyId))) return false;
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff') return true;
  return getProgramCoordinatorAccess(parsePositiveInt(req.user?.id));
}

/**
 * Provider/facilitator assigned to this company event via any staffing path.
 * Includes session staffing (any assignment_status), event-level assignments,
 * and legacy skills-group roster rows.
 */
export async function isUserAssignedToCompanyEvent(userId, eventId, agencyId = null) {
  const uid = parsePositiveInt(userId);
  const eid = parsePositiveInt(eventId);
  if (!uid || !eid) return false;

  const [sgp] = await pool.execute(
    `SELECT 1 AS ok FROM skills_group_providers sgp
     INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
     WHERE sg.company_event_id = ? AND sgp.provider_user_id = ?
     LIMIT 1`,
    [eid, uid]
  ).catch(() => [[]]);
  if (sgp?.[0]?.ok) return true;

  const [epa] = await pool.execute(
    `SELECT 1 AS ok FROM company_event_provider_assignments
     WHERE company_event_id = ? AND provider_user_id = ?
     LIMIT 1`,
    [eid, uid]
  ).catch(() => [[]]);
  if (epa?.[0]?.ok) return true;

  const sessionParams = agencyId
    ? [eid, uid, parsePositiveInt(agencyId)]
    : [eid, uid];
  const sessionSql = agencyId
    ? `SELECT 1 AS ok FROM company_event_session_providers
       WHERE company_event_id = ? AND provider_user_id = ? AND agency_id = ?
       LIMIT 1`
    : `SELECT 1 AS ok FROM company_event_session_providers
       WHERE company_event_id = ? AND provider_user_id = ?
       LIMIT 1`;
  const [csp] = await pool.execute(sessionSql, sessionParams).catch(() => [[]]);
  if (csp?.[0]?.ok) return true;

  try {
    const [sbsp] = await pool.execute(
      `SELECT 1 AS ok
       FROM skill_builders_event_session_providers p
       INNER JOIN skill_builders_event_sessions s ON s.id = p.session_id
       WHERE s.company_event_id = ? AND p.provider_user_id = ?
       LIMIT 1`,
      [eid, uid]
    );
    if (sbsp?.[0]?.ok) return true;
  } catch {
    // optional table
  }

  return false;
}

/** True when the user has any staffing row on a company event in this agency. */
export async function isUserAssignedToAnyCompanyEventInAgency(userId, agencyId) {
  const uid = parsePositiveInt(userId);
  const aid = parsePositiveInt(agencyId);
  if (!uid || !aid) return false;

  try {
    const [rows] = await pool.execute(
      `SELECT 1 AS ok FROM (
         SELECT sgp.provider_user_id
         FROM skills_group_providers sgp
         INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id AND sg.agency_id = ?
         WHERE sgp.provider_user_id = ?
         UNION
         SELECT cepa.provider_user_id
         FROM company_event_provider_assignments cepa
         INNER JOIN company_events ce ON ce.id = cepa.company_event_id AND ce.agency_id = ?
         WHERE cepa.provider_user_id = ?
         UNION
         SELECT cesp.provider_user_id
         FROM company_event_session_providers cesp
         WHERE cesp.agency_id = ? AND cesp.provider_user_id = ?
         UNION
         SELECT p.provider_user_id
         FROM skill_builders_event_session_providers p
         INNER JOIN skill_builders_event_sessions s ON s.id = p.session_id
         INNER JOIN company_events ce ON ce.id = s.company_event_id AND ce.agency_id = ?
         WHERE p.provider_user_id = ?
       ) assigned
       LIMIT 1`,
      [aid, uid, aid, uid, aid, uid, aid, uid]
    );
    return !!rows?.[0]?.ok;
  } catch {
    return false;
  }
}

/** School portal parent events (staffable via company-event session requests). */
export function isSchoolPortalEventType(eventType) {
  const t = String(eventType || '').trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith('school_')) return true;
  return (
    t === 'school_back_to_school' ||
    t === 'school_spring_event' ||
    t === 'school_open_house' ||
    t === 'school_resource_fair' ||
    t === 'school_family_night' ||
    t === 'school_orientation' ||
    t === 'school_other'
  );
}

function staffingSignupEnabled(staffingConfigJson) {
  if (staffingConfigJson == null || staffingConfigJson === '') return false;
  try {
    const cfg =
      typeof staffingConfigJson === 'string' ? JSON.parse(staffingConfigJson) : staffingConfigJson;
    if (!cfg || cfg.enabled === false) return false;
    if (cfg.providerSignup && cfg.providerSignup.enabled === false) return false;
    return true;
  } catch {
    return false;
  }
}

export async function isSchoolOutreachEvent(eventId) {
  const eid = parsePositiveInt(eventId);
  if (!eid) return false;
  const [rows] = await pool.execute(
    `SELECT event_type, outreach_table_invited, staffing_config_json FROM company_events WHERE id = ? LIMIT 1`,
    [eid]
  );
  const row = rows?.[0];
  if (!row) return false;
  if (!isSchoolPortalEventType(row.event_type)) return false;
  return (
    !!(row.outreach_table_invited === 1 || row.outreach_table_invited === true) ||
    staffingSignupEnabled(row.staffing_config_json)
  );
}

/** Read-only event portal access: coordinators/staff or anyone assigned to the event. */
export async function canViewProgramEvent(req, agencyId, eventId) {
  const uid = parsePositiveInt(req.user?.id);
  const eid = parsePositiveInt(eventId);
  const aid = parsePositiveInt(agencyId);
  if (uid && eid && (await isUserAssignedToCompanyEvent(uid, eid, aid))) return true;
  if (!(await userHasAgencyAccessForRequest(req, agencyId))) return false;
  if (await canManageProgramEvent(req, agencyId)) return true;
  return false;
}
