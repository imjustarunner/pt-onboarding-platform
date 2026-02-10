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

export async function supervisorHasSuperviseeInSchool(supervisorUserId, schoolOrganizationId) {
  const schoolOrgId = parsePositiveInt(schoolOrganizationId);
  if (!schoolOrgId) return false;
  const superviseeIds = await getSupervisorSuperviseeIds(supervisorUserId, null);
  if (!superviseeIds.length) return false;

  const placeholders = superviseeIds.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM user_agencies ua
       WHERE ua.agency_id = ?
         AND ua.user_id IN (${placeholders})
       LIMIT 1`,
      [schoolOrgId, ...superviseeIds]
    );
    return !!rows?.[0];
  } catch {
    // Fallback if user_agencies shape differs: check each supervisee via model helper.
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

