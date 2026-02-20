import pool from '../config/database.js';
import User from '../models/User.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';

function parsePositiveInt(value) {
  const n = parseInt(String(value || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dedupePositiveInts(values) {
  return [...new Set((values || []).map((v) => parsePositiveInt(v)).filter(Boolean))];
}

export async function getSupervisorSuperviseeIds(supervisorUserId, agencyId = null) {
  const supervisorId = parsePositiveInt(supervisorUserId);
  if (!supervisorId) return [];
  try {
    const assignments = await SupervisorAssignment.findBySupervisor(supervisorId, agencyId);
    return dedupePositiveInts((assignments || []).map((a) => a?.supervisee_id));
  } catch {
    return [];
  }
}

/** Roles that have full access to all clients; supervisor is additive for these (My Schedule only). */
const ADMIN_LIKE_ROLES = ['admin', 'super_admin', 'superadmin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'];

export function isAdminLikeRole(role) {
  const roleNorm = String(role || '').toLowerCase();
  return ADMIN_LIKE_ROLES.includes(roleNorm);
}

/**
 * True when user is a supervisor actor but NOT admin-like.
 * Use this when deciding whether to restrict client access to supervisees only.
 * Admin/super_admin/support with supervisor privileges get full access; supervisor-only gets restricted.
 */
export async function isSupervisorOnlyActor({ userId, role, user = null }) {
  if (isAdminLikeRole(role)) return false;
  return isSupervisorActor({ userId, role, user });
}

export async function isSupervisorActor({ userId, role, user = null }) {
  const roleNorm = String(role || '').toLowerCase();
  if (roleNorm === 'supervisor') return true;
  const uid = parsePositiveInt(userId);
  if (!uid) return false;
  // JWT-backed req.user often omits has_supervisor_privileges; only trust
  // in-memory user objects when the capability field is present.
  if (user && user.has_supervisor_privileges !== undefined) {
    return User.isSupervisor(user);
  }
  const loaded = await User.findById(uid);
  return User.isSupervisor(loaded);
}

export async function supervisorHasSuperviseeInSchool(supervisorUserId, schoolOrganizationId) {
  const schoolOrgId = parsePositiveInt(schoolOrganizationId);
  if (!schoolOrgId) return false;
  const superviseeIds = await getSupervisorSuperviseeIds(supervisorUserId, null);
  if (!superviseeIds.length) return false;

  const placeholders = superviseeIds.map(() => '?').join(',');

  const hasUserAgenciesMembership = async (orgId) => {
    try {
      const [rows] = await pool.execute(
        `SELECT 1
         FROM user_agencies ua
         WHERE ua.agency_id = ?
           AND ua.user_id IN (${placeholders})
         LIMIT 1`,
        [orgId, ...superviseeIds]
      );
      return !!rows?.[0];
    } catch {
      return false;
    }
  };

  // 1) Direct org membership.
  if (await hasUserAgenciesMembership(schoolOrgId)) return true;

  // 2) Active affiliated agency membership (school/program/learning -> agency).
  try {
    const [affRows] = await pool.execute(
      `SELECT DISTINCT active_agency_id
       FROM (
         SELECT oa.active_agency_id AS active_agency_id
         FROM organization_affiliations oa
         WHERE oa.organization_id = ?
           AND oa.is_active = TRUE
         UNION ALL
         SELECT asch.active_agency_id AS active_agency_id
         FROM agency_schools asch
         WHERE asch.school_id = ?
           AND asch.is_active = TRUE
       ) q
       WHERE q.active_agency_id IS NOT NULL`,
      [schoolOrgId, schoolOrgId]
    );
    const activeAgencyIds = [...new Set((affRows || []).map((r) => parsePositiveInt(r?.active_agency_id)).filter(Boolean))];
    for (const agencyId of activeAgencyIds) {
      if (await hasUserAgenciesMembership(agencyId)) return true;
    }
  } catch {
    // continue to assignment-based fallback checks
  }

  // 3) Assignment-based checks in school context (handles cases where user_agencies is incomplete).
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ?
         AND psa.provider_user_id IN (${placeholders})
         AND psa.is_active = TRUE
       LIMIT 1`,
      [schoolOrgId, ...superviseeIds]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments cpa
       WHERE cpa.organization_id = ?
         AND cpa.provider_user_id IN (${placeholders})
         AND cpa.is_active = TRUE
       LIMIT 1`,
      [schoolOrgId, ...superviseeIds]
    );
    if (rows?.[0]) return true;
  } catch {
    // ignore and continue to model helper fallback
  }

  // 4) Fallback via model helper.
  for (const superviseeId of superviseeIds) {
    try {
      const orgs = await User.getAgencies(superviseeId);
      const hasOrg = (orgs || []).some((org) => parseInt(org.id, 10) === schoolOrgId);
      if (hasOrg) return true;
    } catch {
      // ignore and continue
    }
  }
  return false;
}

export async function supervisorCanAccessClientInOrg({ supervisorUserId, clientId, orgId }) {
  const supervisorId = parsePositiveInt(supervisorUserId);
  const cid = parsePositiveInt(clientId);
  const oid = parsePositiveInt(orgId);
  if (!supervisorId || !cid || !oid) return false;

  const superviseeIds = await getSupervisorSuperviseeIds(supervisorId, null);
  if (!superviseeIds.length) return false;
  const placeholders = superviseeIds.map(() => '?').join(',');

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments cpa
       WHERE cpa.client_id = ?
         AND cpa.organization_id = ?
         AND cpa.provider_user_id IN (${placeholders})
         AND cpa.is_active = TRUE
       LIMIT 1`,
      [cid, oid, ...superviseeIds]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM clients c
       WHERE c.id = ?
         AND c.organization_id = ?
         AND c.provider_id IN (${placeholders})
       LIMIT 1`,
      [cid, oid, ...superviseeIds]
    );
    return !!rows?.[0];
  } catch {
    return false;
  }
}

/**
 * Check if a supervisor has access to a client (via supervisee assignments).
 * Tries organization_id first (school/program), then agency_id.
 */
export async function supervisorCanAccessClient({ supervisorUserId, client }) {
  const sid = parsePositiveInt(supervisorUserId);
  const cid = parsePositiveInt(client?.id);
  if (!sid || !cid) return false;
  const orgId = parsePositiveInt(client?.organization_id);
  const agencyId = parsePositiveInt(client?.agency_id);
  if (orgId && (await supervisorCanAccessClientInOrg({ supervisorUserId: sid, clientId: cid, orgId }))) return true;
  if (agencyId && (await supervisorCanAccessClientInOrg({ supervisorUserId: sid, clientId: cid, orgId: agencyId }))) return true;
  return false;
}

