import crypto from 'crypto';
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import IntakeLink from '../models/IntakeLink.model.js';

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

async function siblingSchoolIds(agencyId, excludeOrgId) {
  const aid = parseInt(agencyId, 10);
  const ex = parseInt(excludeOrgId, 10);
  if (!aid) return [];
  let orgs = [];
  try {
    orgs = await OrganizationAffiliation.listActiveOrganizationsForAgency(aid);
  } catch {
    orgs = [];
  }
  if (!orgs?.length) {
    try {
      const schools = await AgencySchool.listByAgency(aid, { includeInactive: false });
      orgs = (Array.isArray(schools) ? schools : []).map((s) => ({
        id: s.school_organization_id || s.id,
        organization_type: 'school'
      }));
    } catch {
      orgs = [];
    }
  }
  return (orgs || [])
    .filter((o) => String(o?.organization_type || o?.organizationType || 'school').toLowerCase() === 'school')
    .map((o) => parseInt(String(o.id || o.school_organization_id || 0), 10))
    .filter((id) => Number.isFinite(id) && id > 0 && id !== ex);
}

async function findMostRecentSiblingIntakeLink({ agencyId, excludeOrgId, languageCode }) {
  const siblingIds = await siblingSchoolIds(agencyId, excludeOrgId);
  if (!siblingIds.length) return null;
  const placeholders = siblingIds.map(() => '?').join(',');
  const lang = languageCode === 'es' ? 'es' : 'en';
  const [rows] = await pool.execute(
    `SELECT il.*
     FROM intake_links il
     WHERE il.scope_type = 'school'
       AND il.organization_id IN (${placeholders})
       AND COALESCE(il.form_type, 'intake') IN ('intake', 'public_form')
       AND LOWER(COALESCE(NULLIF(TRIM(il.language_code), ''), 'en')) = ?
       AND il.is_active = 1
     ORDER BY il.updated_at DESC, il.id DESC
     LIMIT 8`,
    [...siblingIds, lang]
  );
  for (const row of rows || []) {
    const ft = String(row.form_type || 'intake').toLowerCase();
    if (ft === 'intake' && registrationStepInSteps(row.intake_steps)) continue;
    return row;
  }
  return null;
}

async function duplicateAndActivate({ source, targetOrgId, schoolName, languageCode, createdByUserId }) {
  const lang = languageCode === 'es' ? 'es' : 'en';
  const label = lang === 'es' ? 'Spanish' : 'English';
  const targetName = String(schoolName || 'School').trim() || 'School';
  const baseTitle = source.title
    ? String(source.title).replace(/\s*\(Copy\)\s*$/i, '').trim()
    : `Digital intake (${label})`;
  const title = `${targetName} — Digital intake (${label})`;

  const publicKey = crypto.randomBytes(24).toString('hex');
  const link = await IntakeLink.create({
    publicKey,
    title: title || `${baseTitle} (${targetName})`,
    description: source.description || null,
    languageCode: lang,
    scopeType: 'school',
    formType: source.form_type || 'intake',
    organizationId: targetOrgId,
    programId: null,
    learningClassId: null,
    companyEventId: null,
    jobDescriptionId: null,
    isActive: true,
    createClient: source.create_client !== false,
    createGuardian: source.create_guardian !== false,
    requiresAssignment: source.requires_assignment !== false,
    allowedDocumentTemplateIds: source.allowed_document_template_ids || [],
    intakeFields: source.intake_fields || null,
    intakeSteps: source.intake_steps || null,
    retentionPolicy: source.retention_policy_json || null,
    customMessages: source.custom_messages || null,
    createdByUserId: createdByUserId || null
  });
  return link;
}

/**
 * Copy the agency's most recently updated active EN + ES school intake forms
 * onto a newly created school and activate them.
 */
export async function bootstrapDigitalIntakeFormsForSchool({
  agencyId,
  schoolOrganizationId,
  schoolName,
  createdByUserId = null
}) {
  const result = { en: null, es: null, errors: [] };
  for (const languageCode of ['en', 'es']) {
    try {
      const source = await findMostRecentSiblingIntakeLink({
        agencyId,
        excludeOrgId: schoolOrganizationId,
        languageCode
      });
      if (!source) {
        result.errors.push(`No active ${languageCode.toUpperCase()} school intake form found to copy`);
        continue;
      }
      const link = await duplicateAndActivate({
        source,
        targetOrgId: schoolOrganizationId,
        schoolName,
        languageCode,
        createdByUserId
      });
      result[languageCode] = {
        id: link.id,
        title: link.title,
        languageCode,
        sourceLinkId: source.id,
        sourceSchoolId: source.organization_id
      };
    } catch (e) {
      console.error(`[schoolOnboardingIntakeBootstrap] ${languageCode} failed:`, e?.message || e);
      result.errors.push(`${languageCode}: ${e?.message || 'failed'}`);
    }
  }
  return result;
}
