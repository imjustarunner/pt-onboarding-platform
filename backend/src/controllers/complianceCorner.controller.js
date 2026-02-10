import pool from '../config/database.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, organizationId }) {
  const uid = parseInt(String(userId || ''), 10);
  const orgId = parseInt(String(organizationId || ''), 10);
  if (!uid || !orgId) return false;
  if (String(role || '').toLowerCase() === 'super_admin') return true;
  const orgs = await User.getAgencies(uid);
  const orgIds = (orgs || []).map((o) => parseInt(o.id, 10)).filter(Boolean);
  if (orgIds.includes(orgId)) return true;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(orgId);
  if (!activeAgencyId) return false;
  return orgIds.includes(parseInt(activeAgencyId, 10));
}

function parsePendingChecklist(client, today) {
  const missing = [];
  const parentsContactedAt = client?.parents_contacted_at ? new Date(client.parents_contacted_at) : null;
  const parentsContactedOk = client?.parents_contacted_successful === 1 || client?.parents_contacted_successful === true;
  if (!parentsContactedAt || !parentsContactedOk) missing.push('Parents contacted');

  const intakeAt = client?.intake_at ? new Date(client.intake_at) : null;
  const firstServiceAt = client?.first_service_at ? new Date(client.first_service_at) : null;
  const intakePassed = intakeAt && intakeAt.getTime() <= today.getTime();
  const firstServicePassed = firstServiceAt && firstServiceAt.getTime() <= today.getTime();
  if (!intakePassed) missing.push('Intake date');
  if (!firstServicePassed) missing.push('First session');

  return { missing, intakePassed, firstServicePassed };
}

/**
 * Compliance Corner: list pending clients not yet current.
 * GET /api/compliance-corner/pending-clients
 * query: organizationId (optional), providerUserId (optional)
 */
export const listPendingComplianceClients = async (req, res, next) => {
  try {
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const organizationId = req.query?.organizationId ? parseInt(req.query.organizationId, 10) : null;
    const providerUserId = req.query?.providerUserId ? parseInt(req.query.providerUserId, 10) : null;

    const isAdmin = roleNorm === 'super_admin' || roleNorm === 'admin';
    const actorUser = req.user?.has_supervisor_privileges !== undefined ? req.user : (await User.findById(userId));
    const isSupervisorRole =
      roleNorm === 'supervisor' ||
      roleNorm === 'clinical_practice_assistant' ||
      User.isSupervisor(actorUser);

    if (!organizationId && !providerUserId) {
      return res.status(400).json({ error: { message: 'organizationId or providerUserId is required' } });
    }

    if (isAdmin) {
      if (!organizationId) {
        return res.status(400).json({ error: { message: 'organizationId is required for admin queries' } });
      }
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, organizationId });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    } else if (isSupervisorRole) {
      if (!providerUserId) {
        return res.status(400).json({ error: { message: 'providerUserId is required for supervisor queries' } });
      }
      const [rows] = await pool.execute(
        `SELECT 1 FROM supervisor_assignments WHERE supervisor_id = ? AND supervisee_id = ? LIMIT 1`,
        [userId, providerUserId]
      );
      if (!rows?.[0]) return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const clauses = [
      'cpa.is_active = TRUE',
      "(c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')",
      "(cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')",
      "(LOWER(cs.status_key) = 'pending' OR UPPER(c.status) = 'PENDING_REVIEW')",
      `NOT (
        (c.intake_at IS NOT NULL AND c.intake_at <= CURDATE())
        OR
        (c.first_service_at IS NOT NULL AND c.first_service_at <= CURDATE())
      )`
    ];
    const params = [];

    if (organizationId) {
      clauses.push('cpa.organization_id = ?');
      params.push(organizationId);
    }
    if (providerUserId) {
      clauses.push('cpa.provider_user_id = ?');
      params.push(providerUserId);
    }

    const [rows] = await pool.execute(
      `SELECT
         c.id AS client_id,
         c.initials,
         c.identifier_code,
         c.intake_at,
         c.first_service_at,
         c.parents_contacted_at,
         c.parents_contacted_successful,
         c.status,
         cs.status_key,
         org.id AS organization_id,
         org.name AS organization_name,
         u.id AS provider_user_id,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name,
         u.email AS provider_email,
         MIN(cpa.created_at) AS assigned_at,
         DATEDIFF(CURDATE(), MIN(cpa.created_at)) AS days_since_assigned
       FROM client_provider_assignments cpa
       JOIN clients c ON c.id = cpa.client_id
       JOIN agencies org ON org.id = cpa.organization_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       LEFT JOIN users u ON u.id = cpa.provider_user_id
       WHERE ${clauses.join(' AND ')}
       GROUP BY c.id, org.id, u.id
       ORDER BY days_since_assigned DESC, c.id DESC`,
      params
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const results = (rows || []).map((row) => {
      const { missing } = parsePendingChecklist(row, today);
      return {
        client_id: row.client_id,
        client_initials: row.initials || null,
        client_identifier_code: row.identifier_code || null,
        organization_id: row.organization_id,
        organization_name: row.organization_name || null,
        provider_user_id: row.provider_user_id,
        provider_first_name: row.provider_first_name || null,
        provider_last_name: row.provider_last_name || null,
        provider_email: row.provider_email || null,
        assigned_at: row.assigned_at || null,
        days_since_assigned: Number(row.days_since_assigned || 0),
        missing_checklist: missing
      };
    });

    res.json({ count: results.length, results });
  } catch (e) {
    next(e);
  }
};
