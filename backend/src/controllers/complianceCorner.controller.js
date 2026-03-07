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

const DEFAULT_MIN_PENDING_ENTERED_AT = '2026-02-01';

function parsePendingChecklist(client) {
  const missing = [];
  const parentsContactedAt = client?.parents_contacted_at ? new Date(client.parents_contacted_at) : null;
  const firstServiceAt = client?.first_service_at ? new Date(client.first_service_at) : null;
  const hasParentContactDate = !!parentsContactedAt;
  const hasFirstServiceDate = !!firstServiceAt;

  if (!hasParentContactDate) {
    missing.push('Parent contact date');
  } else if (!hasFirstServiceDate) {
    missing.push('First session date');
  }

  return { missing };
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
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const minPendingEnteredAtRaw = req.query?.minPendingEnteredAt !== undefined
      ? String(req.query.minPendingEnteredAt).trim()
      : DEFAULT_MIN_PENDING_ENTERED_AT;
    const minPendingEnteredAt = minPendingEnteredAtRaw
      ? (/^\d{4}-\d{2}-\d{2}$/.test(minPendingEnteredAtRaw) ? minPendingEnteredAtRaw : null)
      : null;
    if (minPendingEnteredAtRaw && !minPendingEnteredAt) {
      return res.status(400).json({ error: { message: 'minPendingEnteredAt must be YYYY-MM-DD' } });
    }

    const isBackofficeRole = ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm);
    const isProviderRole = roleNorm === 'provider' || roleNorm === 'provider_plus';
    const actorUser = req.user?.has_supervisor_privileges !== undefined ? req.user : (await User.findById(userId));
    const isSupervisorRole =
      roleNorm === 'supervisor' ||
      roleNorm === 'clinical_practice_assistant' ||
      User.isSupervisor(actorUser);

    if (!organizationId && !providerUserId && !agencyId) {
      return res.status(400).json({ error: { message: 'organizationId, providerUserId, or agencyId is required' } });
    }

    if (isBackofficeRole) {
      if (organizationId) {
        const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: roleNorm, organizationId });
        if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
      } else if (agencyId) {
        if (roleNorm !== 'super_admin') {
          const actorOrgs = await User.getAgencies(userId);
          const actorOrgIds = (actorOrgs || []).map((o) => Number(o?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
          let hasAgencyAccess = actorOrgIds.includes(Number(agencyId));
          if (!hasAgencyAccess) {
            for (const orgId of actorOrgIds) {
              // eslint-disable-next-line no-await-in-loop
              const affiliatedAgencyId = await resolveActiveAgencyIdForOrg(orgId);
              if (Number(affiliatedAgencyId || 0) === Number(agencyId)) {
                hasAgencyAccess = true;
                break;
              }
            }
          }
          if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else if (providerUserId) {
        // Admin/provider-only query support for supervisee widgets:
        // require at least one shared organization/agency membership.
        const [actorOrgs, providerOrgs] = await Promise.all([
          User.getAgencies(userId),
          User.getAgencies(providerUserId)
        ]);
        const actorOrgIds = new Set((actorOrgs || []).map((o) => Number(o?.id || 0)).filter((n) => Number.isFinite(n) && n > 0));
        const providerOrgIds = (providerOrgs || []).map((o) => Number(o?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
        const hasSharedOrg = providerOrgIds.some((id) => actorOrgIds.has(id));
        if (!hasSharedOrg) return res.status(403).json({ error: { message: 'Access denied' } });
      } else {
        return res.status(400).json({ error: { message: 'organizationId, providerUserId, or agencyId is required for backoffice queries' } });
      }
    } else if (isSupervisorRole) {
      if (!providerUserId) {
        return res.status(400).json({ error: { message: 'providerUserId is required for supervisor queries' } });
      }
      const [rows] = await pool.execute(
        `SELECT 1 FROM supervisor_assignments WHERE supervisor_id = ? AND supervisee_id = ? LIMIT 1`,
        [userId, providerUserId]
      );
      if (!rows?.[0]) return res.status(403).json({ error: { message: 'Access denied' } });
    } else if (isProviderRole) {
      if (!providerUserId || Number(providerUserId) !== Number(userId)) {
        return res.status(403).json({ error: { message: 'Providers can only query their own pending clients.' } });
      }
      if (agencyId) {
        const providerOrgs = await User.getAgencies(userId);
        const providerOrgIds = (providerOrgs || []).map((o) => Number(o?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
        let hasAgencyAccess = providerOrgIds.includes(Number(agencyId));
        if (!hasAgencyAccess) {
          for (const orgId of providerOrgIds) {
            // eslint-disable-next-line no-await-in-loop
            const affiliatedAgencyId = await resolveActiveAgencyIdForOrg(orgId);
            if (Number(affiliatedAgencyId || 0) === Number(agencyId)) {
              hasAgencyAccess = true;
              break;
            }
          }
        }
        if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied' } });
      }
    } else {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const clauses = [
      'cpa.is_active = TRUE',
      "(c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')",
      "(cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')",
      "(LOWER(cs.status_key) = 'pending' OR UPPER(c.status) = 'PENDING_REVIEW')",
      "(org.organization_type IS NULL OR LOWER(org.organization_type) = 'school')",
      `(c.parents_contacted_at IS NULL OR c.first_service_at IS NULL)`
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
    if (agencyId) {
      clauses.push('c.agency_id = ?');
      params.push(agencyId);
    }

    const [rows] = await pool.execute(
      `SELECT
         c.id AS client_id,
         c.initials,
         c.identifier_code,
         c.submission_date,
         c.created_at,
         c.first_service_at,
         c.parents_contacted_at,
         c.status,
         cs.status_key,
         pending_cs.id AS pending_status_id,
         org.id AS organization_id,
         org.name AS organization_name,
         u.id AS provider_user_id,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name,
         u.email AS provider_email,
         NULLIF(
           GREATEST(
             COALESCE(
               (
                 SELECT MAX(h_status.changed_at)
                 FROM client_status_history h_status
                 WHERE h_status.client_id = c.id
                   AND h_status.field_changed = 'status'
                   AND UPPER(h_status.to_value) = 'PENDING_REVIEW'
               ),
               '1000-01-01 00:00:00'
             ),
             COALESCE(
               (
                 SELECT MAX(h_cs.changed_at)
                 FROM client_status_history h_cs
                 WHERE h_cs.client_id = c.id
                   AND h_cs.field_changed = 'client_status_id'
                   AND CAST(h_cs.to_value AS UNSIGNED) = pending_cs.id
               ),
               '1000-01-01 00:00:00'
             )
           ),
           '1000-01-01 00:00:00'
         ) AS pending_entered_at,
         MIN(cpa.created_at) AS assigned_at,
         DATEDIFF(CURDATE(), MIN(cpa.created_at)) AS days_since_assigned,
         CASE
           WHEN c.parents_contacted_at IS NULL THEN 'no_parent_contact'
           ELSE 'no_first_session'
         END AS pending_stage
       FROM client_provider_assignments cpa
       JOIN clients c ON c.id = cpa.client_id
       JOIN agencies org ON org.id = cpa.organization_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       LEFT JOIN client_statuses pending_cs
         ON pending_cs.agency_id = c.agency_id
        AND LOWER(pending_cs.status_key) = 'pending'
       LEFT JOIN users u ON u.id = cpa.provider_user_id
       WHERE ${clauses.join(' AND ')}
       GROUP BY c.id, org.id, u.id, pending_cs.id
       ORDER BY days_since_assigned DESC, c.id DESC`,
      params
    );

    let results = (rows || []).map((row) => {
      const { missing } = parsePendingChecklist(row);
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
        pending_added_at: row.pending_entered_at || row.created_at || row.submission_date || null,
        assigned_at: row.assigned_at || null,
        days_since_assigned: Number(row.days_since_assigned || 0),
        pending_stage: row.pending_stage === 'no_parent_contact' ? 'no_parent_contact' : 'no_first_session',
        tracking_days: Number(row.days_since_assigned || 0),
        parent_contacted_at: row.parents_contacted_at || null,
        first_service_at: row.first_service_at || null,
        missing_checklist: missing
      };
    });

    if (minPendingEnteredAt) {
      const cutoffTs = new Date(`${minPendingEnteredAt}T00:00:00`).getTime();
      results = results.filter((row) => {
        const raw = row?.pending_added_at;
        if (!raw) return false;
        const ts = new Date(raw).getTime();
        return Number.isFinite(ts) && ts >= cutoffTs;
      });
    }

    res.json({ count: results.length, results });
  } catch (e) {
    next(e);
  }
};
