import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import { isSupervisorActor, supervisorHasSuperviseeInSchool } from '../utils/supervisorSchoolAccess.js';

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
  return r === 'admin' || r === 'support' || r === 'staff' || r === 'supervisor';
}

/** Create/duplicate school-scoped intake links from the school portal admin UI. */
function roleCanManageSchoolPortalIntakes(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'staff' || r === 'super_admin';
}

function registrationStepInSteps(steps) {
  let arr = steps;
  if (arr == null) return false;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(arr)) return false;
  return arr.some((s) => String(s?.type || '').trim().toLowerCase() === 'registration');
}

/** Other school/program org rows under the same agency (for copy-from), excluding the current portal org. */
async function siblingPortalOrganizationIdsForAgency(agencyId, excludeOrgId, portalOrgType) {
  const aid = agencyId ? parseInt(String(agencyId), 10) : null;
  if (!aid) return [];
  const orgs = await OrganizationAffiliation.listActiveOrganizationsForAgency(aid);
  const ex = parseInt(String(excludeOrgId), 10);
  const t = String(portalOrgType || 'school').toLowerCase();
  const matchesPortalFamily = (o) => {
    const ot = String(o?.organization_type || '').toLowerCase();
    if (t === 'program') return ot === 'program' || ot === 'learning';
    return ot === 'school';
  };
  return (orgs || [])
    .filter((o) => matchesPortalFamily(o) && parseInt(String(o?.id), 10) !== ex)
    .map((o) => parseInt(String(o.id), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function isCopyableSchoolIntakeFormType(formType) {
  const t = String(formType || 'intake').toLowerCase();
  return t === 'intake' || t === 'public_form';
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

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, user = null, schoolOrganizationId }) {
  if (!userId) return false;
  const roleNorm = String(role || '').toLowerCase();
  const userOrgs = await User.getAgencies(userId);
  const hasDirect = (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(schoolOrganizationId, 10));
  if (hasDirect) return true;
  const hasSupervisorCapability = await isSupervisorActor({ userId, role, user });
  if (roleNorm === 'provider') {
    const hasProviderAccess = await providerHasSchoolAccess({ providerUserId: userId, schoolOrganizationId });
    if (hasProviderAccess) return true;
    if (!hasSupervisorCapability) return false;
  }
  if (hasSupervisorCapability) {
    const hasSuperviseeSchoolAccess = await supervisorHasSuperviseeInSchool(userId, schoolOrganizationId);
    if (hasSuperviseeSchoolAccess) return true;
  }
  if (!roleCanUseAgencyAffiliation(role)) return false;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);
  if (!activeAgencyId) return false;
  return (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(activeAgencyId, 10));
}

export async function assertSchoolPortalAccess(req, schoolId, options = {}) {
  const allowClinical = !!options.allowClinical;
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
  const allowedTypes = allowClinical ? ['school', 'program', 'learning', 'clinical'] : ['school', 'program', 'learning'];
  if (!allowedTypes.includes(orgType)) {
    const e = new Error(`This endpoint is only available for organizations of type: ${allowedTypes.join(', ')}`);
    e.statusCode = 400;
    throw e;
  }

  if (String(role || '').toLowerCase() !== 'super_admin') {
    const ok = await userHasOrgOrAffiliatedAgencyAccess({
      userId,
      role,
      user: req.user,
      schoolOrganizationId: sid
    });
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
    const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() === '1'
      || String(req.query?.includeInactive || '').trim().toLowerCase() === 'true';

    try {
      const activeClause = includeInactive ? '' : 'AND is_active = 1';
      const [rows] = await pool.execute(
        `SELECT id, public_key, title, description, language_code, scope_type, organization_id, program_id, is_active, created_at, updated_at
         FROM intake_links
         WHERE scope_type = ?
           AND organization_id = ?
           ${activeClause}
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

/**
 * GET /school-portal/:organizationId/intake-links/copy-sources
 * Intake links on sibling schools (same affiliated agency) for "copy to this school".
 */
export const listSchoolPortalIntakeLinkCopySources = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const { sid, org } = await assertSchoolPortalAccess(req, organizationId);
    if (!roleCanManageSchoolPortalIntakes(req.user?.role)) {
      return res.status(403).json({ error: { message: 'You do not have permission to manage digital forms for this school.' } });
    }

    const orgType = String(org?.organization_type || 'school').toLowerCase();
    const scopeType = orgType === 'program' ? 'program' : 'school';
    const agencyId = await resolveActiveAgencyIdForOrg(sid);
    const siblingIds = await siblingPortalOrganizationIdsForAgency(agencyId, sid, orgType);
    if (!siblingIds.length) {
      return res.json({ organizationId: sid, links: [] });
    }

    const langRaw = String(req.query?.languageCode || '').trim().toLowerCase();
    const langFilter = langRaw === 'en' || langRaw === 'es' ? langRaw : null;

    const placeholders = siblingIds.map(() => '?').join(',');
    const params = [...siblingIds];
    let langClause = '';
    if (langFilter) {
      langClause = ' AND LOWER(COALESCE(NULLIF(TRIM(il.language_code), \'\'), \'en\')) = ? ';
      params.push(langFilter);
    }

    const [rows] = await pool.execute(
      `SELECT il.id, il.public_key, il.title, il.description, il.language_code, il.scope_type, il.organization_id,
              il.is_active, il.form_type, a.name AS school_name
       FROM intake_links il
       JOIN agencies a ON a.id = il.organization_id
       WHERE il.scope_type = ?
         AND il.organization_id IN (${placeholders})
         AND (COALESCE(il.form_type, 'intake') IN ('intake', 'public_form'))
         ${langClause}
       ORDER BY a.name ASC, il.updated_at DESC, il.id DESC`,
      [scopeType, ...params]
    );
    res.json({ organizationId: sid, links: rows || [] });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /school-portal/:organizationId/intake-links/create
 * Body: { languageCode?: 'en'|'es' }
 */
/**
 * PUT /school-portal/:organizationId/intake-links/:linkId/activate
 * Sets link active when it belongs to this school (staff-friendly; avoids global intake admin middleware).
 */
export const activateSchoolPortalIntakeLink = async (req, res, next) => {
  try {
    const { organizationId, linkId } = req.params;
    const { sid } = await assertSchoolPortalAccess(req, organizationId);
    if (!roleCanManageSchoolPortalIntakes(req.user?.role)) {
      return res.status(403).json({ error: { message: 'You do not have permission to manage digital forms for this school.' } });
    }
    const id = parseInt(String(linkId || ''), 10);
    if (!id) return res.status(400).json({ error: { message: 'linkId is required' } });

    const link = await IntakeLink.findById(id);
    if (!link || parseInt(String(link.organization_id || 0), 10) !== sid) {
      return res.status(404).json({ error: { message: 'Intake link not found for this school.' } });
    }

    await pool.execute(
      'UPDATE intake_links SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ?',
      [id, sid]
    );
    const updated = await IntakeLink.findById(id);
    res.json({ link: updated });
  } catch (e) {
    next(e);
  }
};

export const createSchoolPortalIntakeLink = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const { sid, org } = await assertSchoolPortalAccess(req, organizationId);
    if (!roleCanManageSchoolPortalIntakes(req.user?.role)) {
      return res.status(403).json({ error: { message: 'You do not have permission to manage digital forms for this school.' } });
    }

    const orgType = String(org?.organization_type || 'school').toLowerCase();
    const scopeType = orgType === 'program' ? 'program' : 'school';
    const lang = String(req.body?.languageCode || 'en').trim().toLowerCase();
    const languageCode = lang === 'es' ? 'es' : 'en';
    const schoolName = String(org?.name || 'School').trim() || 'School';
    const label = languageCode === 'es' ? 'Spanish' : 'English';
    const title = `${schoolName} — Digital intake (${label})`;

    const publicKey = crypto.randomBytes(24).toString('hex');
    const link = await IntakeLink.create({
      publicKey,
      title,
      description: null,
      languageCode,
      scopeType,
      formType: 'intake',
      organizationId: sid,
      programId: null,
      learningClassId: null,
      companyEventId: null,
      jobDescriptionId: null,
      isActive: true,
      createClient: true,
      createGuardian: false,
      requiresAssignment: true,
      allowedDocumentTemplateIds: null,
      intakeFields: null,
      intakeSteps: null,
      retentionPolicy: null,
      customMessages: null,
      createdByUserId: req.user?.id || null
    });

    res.status(201).json({ link });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /school-portal/:organizationId/intake-links/duplicate-from
 * Body: { sourceLinkId: number, languageCode?: 'en'|'es' }
 */
export const duplicateSchoolPortalIntakeLinkFrom = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const { sid, org } = await assertSchoolPortalAccess(req, organizationId);
    if (!roleCanManageSchoolPortalIntakes(req.user?.role)) {
      return res.status(403).json({ error: { message: 'You do not have permission to manage digital forms for this school.' } });
    }

    const sourceId = parseInt(String(req.body?.sourceLinkId || ''), 10);
    if (!sourceId) {
      return res.status(400).json({ error: { message: 'sourceLinkId is required' } });
    }

    const existing = await IntakeLink.findById(sourceId);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const orgType = String(org?.organization_type || 'school').toLowerCase();
    const scopeType = orgType === 'program' ? 'program' : 'school';
    if (String(existing.scope_type || '').toLowerCase() !== scopeType) {
      return res.status(400).json({ error: { message: 'Source link scope does not match this organization type.' } });
    }
    if (!isCopyableSchoolIntakeFormType(existing.form_type)) {
      return res.status(400).json({ error: { message: 'This link type cannot be copied from the school portal. Use Digital Forms in settings.' } });
    }
    const ft = String(existing.form_type || 'intake').toLowerCase();
    if (ft === 'intake' && registrationStepInSteps(existing.intake_steps)) {
      return res.status(400).json({
        error: { message: 'Intake links with a Registration step cannot be duplicated here. Use Digital Forms in settings.' }
      });
    }

    const agencyId = await resolveActiveAgencyIdForOrg(sid);
    const siblingIds = await siblingPortalOrganizationIdsForAgency(agencyId, sid, orgType);
    const srcOrg = parseInt(String(existing.organization_id || 0), 10);
    if (!srcOrg || srcOrg === sid || !siblingIds.includes(srcOrg)) {
      return res.status(403).json({ error: { message: 'You can only copy forms from another school under the same agency.' } });
    }

    const langOverride = String(req.body?.languageCode || '').trim().toLowerCase();
    const languageCode = langOverride === 'es' || langOverride === 'en'
      ? langOverride
      : String(existing.language_code || 'en').trim().toLowerCase() || 'en';

    const targetSchoolName = String(org?.name || 'School').trim() || 'School';
    const baseTitle = existing.title ? String(existing.title).replace(/\s*\(Copy\)\s*$/i, '').trim() : 'Digital form';
    const title = `${baseTitle} (${targetSchoolName})`;

    const publicKey = crypto.randomBytes(24).toString('hex');
    const link = await IntakeLink.create({
      publicKey,
      title,
      description: existing.description || null,
      languageCode,
      scopeType,
      formType: existing.form_type || 'intake',
      organizationId: sid,
      programId: existing.program_id || null,
      learningClassId: existing.learning_class_id || null,
      companyEventId: existing.company_event_id || null,
      jobDescriptionId: existing.job_description_id || null,
      isActive: false,
      createClient: existing.create_client !== false,
      createGuardian: existing.create_guardian !== false,
      requiresAssignment: existing.requires_assignment !== false,
      allowedDocumentTemplateIds: existing.allowed_document_template_ids || [],
      intakeFields: existing.intake_fields || null,
      intakeSteps: existing.intake_steps || null,
      retentionPolicy: existing.retention_policy_json || null,
      customMessages: existing.custom_messages || null,
      createdByUserId: req.user?.id || null
    });

    res.status(201).json({ link });
  } catch (e) {
    next(e);
  }
};

