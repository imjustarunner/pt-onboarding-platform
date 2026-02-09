import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';

// Keep access rules aligned with schoolPublicDocuments.controller.js
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

async function providerHasSchoolAccess({ providerUserId, schoolOrganizationId }) {
  const uid = parseInt(providerUserId, 10);
  const orgId = parseInt(schoolOrganizationId, 10);
  if (!uid || !orgId) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ?
         AND psa.provider_user_id = ?
         AND psa.is_active = TRUE
       LIMIT 1`,
      [orgId, uid]
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
         AND cpa.provider_user_id = ?
         AND cpa.is_active = TRUE
       LIMIT 1`,
      [orgId, uid]
    );
    return !!rows?.[0];
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (missing) return false;
    throw e;
  }
}

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, schoolOrganizationId }) {
  if (!userId) return false;
  const userOrgs = await User.getAgencies(userId);
  const hasDirect = (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(schoolOrganizationId, 10));
  if (hasDirect) return true;
  if (String(role || '').toLowerCase() === 'provider') {
    return await providerHasSchoolAccess({ providerUserId: userId, schoolOrganizationId });
  }
  if (!roleCanUseAgencyAffiliation(role)) return false;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);
  if (!activeAgencyId) return false;
  return (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(activeAgencyId, 10));
}

async function assertSchoolPortalAccess(req, schoolId) {
  const sid = parseInt(String(schoolId || ''), 10);
  if (!sid) {
    const e = new Error('Invalid schoolId');
    e.statusCode = 400;
    throw e;
  }
  const userId = req.user?.id;
  const role = req.user?.role;

  const org = await Agency.findById(sid);
  if (!org) {
    const e = new Error('Organization not found');
    e.statusCode = 404;
    throw e;
  }
  const orgType = String(org.organization_type || 'agency').toLowerCase();
  const allowedTypes = ['school', 'program', 'learning'];
  if (!allowedTypes.includes(orgType)) {
    const e = new Error(`This endpoint is only available for organizations of type: ${allowedTypes.join(', ')}`);
    e.statusCode = 400;
    throw e;
  }

  if (String(role || '').toLowerCase() !== 'super_admin') {
    const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role, schoolOrganizationId: sid });
    if (!ok) {
      const e = new Error('You do not have access to this school organization');
      e.statusCode = 403;
      throw e;
    }
  }
  return { sid, org };
}

export const listSchoolPortalIntakeLinks = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const { sid, org } = await assertSchoolPortalAccess(req, organizationId);

    const orgType = String(org?.organization_type || 'school').toLowerCase();
    const scopeType = orgType === 'program' ? 'program' : 'school';

    try {
      const [rows] = await pool.execute(
        `SELECT id, public_key, title, description, scope_type, organization_id, program_id, is_active, created_at, updated_at
         FROM intake_links
         WHERE is_active = 1
           AND scope_type = ?
           AND organization_id = ?
         ORDER BY updated_at DESC, id DESC`,
        [scopeType, sid]
      );
      res.json({ scopeType, organizationId: sid, links: rows || [] });
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ error: { message: 'Intake links are not enabled (missing intake_links table).' } });
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

