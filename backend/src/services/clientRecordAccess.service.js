/**
 * Shared client record access — used by getClientById, demographics, notes,
 * and middleware. Assigned clinicians must be able to open clients on their
 * caseload even when user_agencies membership doesn't match client.agency_id
 * (school org vs parent agency mismatch).
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';

const CLINICIAN_ROLES = new Set([
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'clinical_practice_assistant'
]);

const PROVIDER_ASSIGNMENT_ROLES = new Set(['provider', 'provider_plus']);

export async function providerHasAssignedClientAccess({ userId, clientId, client = null }) {
  const uid = parseInt(userId, 10);
  const cid = parseInt(clientId, 10);
  if (!uid || !cid) return false;

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments
       WHERE client_id = ?
         AND provider_user_id = ?
         AND is_active = TRUE
       LIMIT 1`,
      [cid, uid]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (!missing) throw e;
  }

  return parseInt(client?.provider_id || 0, 10) === uid;
}

/**
 * Membership / school-scope access without requiring an assignment row.
 */
export async function userHasClientScopeMembership({ userId, client }) {
  if (!userId || !client) return false;
  const orgs = await User.getAgencies(userId);
  const memberIds = new Set(
    (orgs || []).map((o) => Number(o.id)).filter((n) => Number.isFinite(n) && n > 0)
  );
  const agencyId = Number(client.agency_id) || 0;
  const orgId = Number(client.organization_id) || 0;

  if (agencyId && memberIds.has(agencyId)) return true;
  if (orgId && memberIds.has(orgId)) return true;

  const cid = Number(client.id) || 0;
  if (cid && memberIds.size) {
    try {
      const ids = [...memberIds];
      const ph = ids.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT 1
         FROM client_agency_assignments
         WHERE client_id = ?
           AND is_active = TRUE
           AND agency_id IN (${ph})
         LIMIT 1`,
        [cid, ...ids]
      );
      if (rows?.length) return true;
    } catch {
      /* table may not exist */
    }
  }

  // Provider assigned to the client's school org via PSA
  if (orgId) {
    try {
      const [psa] = await pool.execute(
        `SELECT 1
         FROM provider_school_assignments
         WHERE provider_user_id = ?
           AND school_organization_id = ?
           AND (is_active = 1 OR is_active IS NULL OR is_active = TRUE)
         LIMIT 1`,
        [userId, orgId]
      );
      if (psa?.length) return true;
    } catch {
      /* ignore */
    }
  }

  // User's agency affiliates with the client's school organization
  if (orgId && memberIds.size) {
    const ids = [...memberIds];
    const ph = ids.map(() => '?').join(',');
    try {
      const [aff] = await pool.execute(
        `SELECT 1
         FROM organization_affiliations
         WHERE organization_id = ?
           AND agency_id IN (${ph})
           AND (is_active = 1 OR is_active IS NULL OR is_active = TRUE)
         LIMIT 1`,
        [orgId, ...ids]
      );
      if (aff?.length) return true;
    } catch {
      try {
        const [aff] = await pool.execute(
          `SELECT 1
           FROM organization_affiliations
           WHERE organization_id = ?
             AND active_agency_id IN (${ph})
           LIMIT 1`,
          [orgId, ...ids]
        );
        if (aff?.length) return true;
      } catch {
        /* ignore */
      }
    }
    try {
      const [schools] = await pool.execute(
        `SELECT 1
         FROM agency_schools
         WHERE school_organization_id = ?
           AND agency_id IN (${ph})
           AND (is_active = 1 OR is_active IS NULL OR is_active = TRUE)
         LIMIT 1`,
        [orgId, ...ids]
      );
      if (schools?.length) return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}

/**
 * Resolve whether the user may load a client record (detail / demographics / notes).
 * @returns {{ ok: true, client, isAssignedClinician: boolean, hasAgencyAccess: boolean }
 *          | { ok: false, status: number, message: string, client: object|null }}
 */
export async function resolveClientRecordAccess({
  userId,
  role,
  clientId = null,
  client = null
} = {}) {
  const roleNorm = String(role || '').toLowerCase();
  let row = client;
  const cid = Number(clientId || client?.id) || 0;

  if (!row && cid) {
    row = await Client.findById(cid, { includeSensitive: true });
  }
  if (!row) {
    return { ok: false, status: 404, message: 'Client not found', client: null };
  }

  if (roleNorm === 'super_admin') {
    return { ok: true, client: row, isAssignedClinician: false, hasAgencyAccess: true };
  }

  const isAssigned = await providerHasAssignedClientAccess({
    userId,
    clientId: row.id,
    client: row
  });

  // Caseload assignment is authoritative for clinicians — do not also require
  // matching user_agencies (school vs parent-agency mismatch is common).
  if (CLINICIAN_ROLES.has(roleNorm) && isAssigned) {
    return {
      ok: true,
      client: row,
      isAssignedClinician: true,
      hasAgencyAccess: await userHasClientScopeMembership({ userId, client: row })
    };
  }

  const hasScope = await userHasClientScopeMembership({ userId, client: row });
  if (!hasScope) {
    return {
      ok: false,
      status: 403,
      message: 'You do not have access to this client',
      client: row
    };
  }

  if (PROVIDER_ASSIGNMENT_ROLES.has(roleNorm) && !isAssigned) {
    return {
      ok: false,
      status: 403,
      message: 'Assigned provider access is required for this client',
      client: row
    };
  }

  return {
    ok: true,
    client: row,
    isAssignedClinician: isAssigned,
    hasAgencyAccess: true
  };
}
