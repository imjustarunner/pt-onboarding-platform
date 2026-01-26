/**
 * School Portal Controller
 * Handles restricted school portal views and client list access
 */

import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

function roleCanUseAgencyAffiliation(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'staff';
}

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, schoolOrganizationId }) {
  if (!userId) return false;
  const userOrgs = await User.getAgencies(userId);
  const hasDirect = (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(schoolOrganizationId, 10));
  if (hasDirect) return true;

  if (!roleCanUseAgencyAffiliation(role)) return false;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);
  if (!activeAgencyId) return false;
  return (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(activeAgencyId, 10));
}

/**
 * Get clients for school portal (restricted view)
 * GET /api/school-portal/:organizationId/clients
 * 
 * Returns only non-sensitive client data:
 * - Student Status
 * - Assigned Provider Name
 * - Admin Notes (non-clinical, shared notes only)
 * - Submission Date
 * 
 * Hidden fields (FERPA/HIPAA compliance):
 * - Billing information
 * - SSNs
 * - Clinical notes
 * - Internal notes
 */
export const getSchoolClients = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Verify organization exists (school/program/learning)
    const organization = await Agency.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ 
        error: { message: 'Organization not found' } 
      });
    }

    const orgType = String(organization.organization_type || 'agency').toLowerCase();
    const allowedTypes = ['school', 'program', 'learning'];
    if (!allowedTypes.includes(orgType)) {
      return res.status(400).json({
        error: { message: `This endpoint is only available for organizations of type: ${allowedTypes.join(', ')}` }
      });
    }

    // Access rules:
    // - school_staff/providers still rely on direct school membership
    // - agency staff/admin/support may access via the school’s active affiliated agency
    if (userRole !== 'super_admin') {
      const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role: userRole, schoolOrganizationId: organizationId });
      if (!ok) {
        return res.status(403).json({
          error: { message: 'You do not have access to this school organization' }
        });
      }
    }

    // Get clients for this organization (restricted view - no sensitive data).
    // Prefer multi-org assignment tables, fall back to legacy clients.organization_id.
    let clients = [];
    try {
      const orgId = parseInt(organizationId, 10);
      const providerUserId = req.user?.role === 'provider' ? parseInt(req.user?.id || 0, 10) : null;
      const [rows] = await pool.execute(
        `SELECT
           c.id,
           c.initials,
           c.identifier_code,
           c.client_status_id,
           cs.label AS client_status_label,
           cs.status_key AS client_status_key,
           c.grade,
           c.school_year,
           GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name) ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ', ') AS provider_name,
           GROUP_CONCAT(DISTINCT cpa.provider_user_id ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ',') AS provider_ids,
           GROUP_CONCAT(DISTINCT cpa.service_day ORDER BY FIELD(cpa.service_day,'Monday','Tuesday','Wednesday','Thursday','Friday') SEPARATOR ', ') AS service_day,
           MAX(CASE WHEN ? IS NOT NULL AND cpa.provider_user_id = ? THEN 1 ELSE 0 END) AS user_is_assigned_provider,
           c.submission_date,
           c.document_status,
           c.status
         FROM clients c
         JOIN client_organization_assignments coa
           ON coa.client_id = c.id
          AND coa.organization_id = ?
          AND coa.is_active = TRUE
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
         LEFT JOIN client_provider_assignments cpa
           ON cpa.client_id = c.id
          AND cpa.organization_id = coa.organization_id
          AND cpa.is_active = TRUE
         LEFT JOIN users u ON u.id = cpa.provider_user_id
         WHERE UPPER(c.status) <> 'ARCHIVED'
         GROUP BY c.id
         ORDER BY c.submission_date DESC, c.id DESC`,
        [providerUserId, providerUserId, orgId]
      );
      clients = rows || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing =
        msg.includes("doesn't exist") ||
        msg.includes('ER_NO_SUCH_TABLE') ||
        msg.includes('Unknown column') ||
        msg.includes('ER_BAD_FIELD_ERROR');
      if (!missing) throw e;

      // Legacy fallback
      const all = await Client.findByOrganizationId(parseInt(organizationId, 10));
      clients = (all || []).filter((c) => String(c?.status || '').toUpperCase() !== 'ARCHIVED');
    }

    // Unread note counts (per user) - best effort if table exists.
    const unreadCountsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && userId) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT n.client_id, COUNT(*) AS unread_count
           FROM client_notes n
           LEFT JOIN client_note_reads r
             ON r.client_id = n.client_id AND r.user_id = ?
           WHERE n.client_id IN (${placeholders})
             AND n.is_internal_only = FALSE
             AND n.created_at > COALESCE(r.last_read_at, '1970-01-01')
           GROUP BY n.client_id`,
          [userId, ...clientIds]
        );
        for (const r of rows || []) {
          unreadCountsByClientId.set(Number(r.client_id), Number(r.unread_count || 0));
        }
      }
    } catch {
      // table may not exist yet; ignore
    }

    // Format response: Only include non-sensitive fields
    const restrictedClients = clients.map(client => {
      return {
        id: client.id,
        initials: client.initials,
        identifier_code: client.identifier_code || null,
        // "status" (workflow) is treated as an internal archive flag; schools should see the configured client status.
        client_status_id: client.client_status_id || null,
        client_status_label: client.client_status_label || null,
        client_status_key: client.client_status_key || null,
        grade: client.grade || null,
        school_year: client.school_year || null,
        provider_id: null,
        provider_name: client.provider_name || null,
        service_day: client.service_day || null,
        user_is_assigned_provider: client.user_is_assigned_provider === 1 || client.user_is_assigned_provider === true,
        submission_date: client.submission_date,
        document_status: client.document_status,
        unread_notes_count: unreadCountsByClientId.get(Number(client.id)) || 0
      };
    });

    res.json(restrictedClients);
  } catch (error) {
    console.error('School portal clients error:', error);
    next(error);
  }
};

/**
 * Get school -> agency affiliation context for UI gating.
 * GET /api/school-portal/:schoolId/affiliation
 */
export const getSchoolPortalAffiliation = async (req, res, next) => {
  try {
    const { schoolId } = req.params;
    const sid = parseInt(schoolId, 10);
    if (!sid) return res.status(400).json({ error: { message: 'Invalid schoolId' } });

    const org = await Agency.findById(sid);
    if (!org) return res.status(404).json({ error: { message: 'School organization not found' } });
    const orgType = String(org.organization_type || 'agency').toLowerCase();
    if (orgType !== 'school') return res.status(400).json({ error: { message: 'This endpoint is only available for school organizations' } });

    const activeAgencyId = await resolveActiveAgencyIdForOrg(sid);
    const userId = req.user?.id;
    const role = req.user?.role;
    const roleNorm = String(role || '').toLowerCase();

    let userHasAgencyAccess = false;
    let userHasSchoolAccess = false;
    if (userId) {
      const orgs = await User.getAgencies(userId);
      userHasSchoolAccess = (orgs || []).some((o) => parseInt(o.id, 10) === sid);
      userHasAgencyAccess = activeAgencyId
        ? (orgs || []).some((o) => parseInt(o.id, 10) === parseInt(activeAgencyId, 10))
        : false;
    }

    // UI gating:
    // - Never allow edit from school_staff/provider
    // - super_admin always allowed
    // - admin/staff/support allowed when they have agency access via active affiliation
    const canEditClients =
      roleNorm === 'super_admin'
        ? true
        : (roleCanUseAgencyAffiliation(role) && !!activeAgencyId && userHasAgencyAccess && roleNorm !== 'provider' && roleNorm !== 'school_staff');

    res.json({
      school_organization_id: sid,
      active_agency_id: activeAgencyId ? parseInt(activeAgencyId, 10) : null,
      user_has_school_access: !!userHasSchoolAccess,
      user_has_agency_access: !!userHasAgencyAccess,
      can_edit_clients: !!canEditClients
    });
  } catch (e) {
    next(e);
  }
};
