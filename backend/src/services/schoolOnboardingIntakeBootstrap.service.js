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

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : null;
    } catch {
      return null;
    }
  }
  return null;
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

async function findExistingSchoolIntakeLink({ schoolOrganizationId, languageCode }) {
  const orgId = parseInt(schoolOrganizationId, 10);
  if (!orgId) return null;
  const lang = languageCode === 'es' ? 'es' : 'en';
  const [rows] = await pool.execute(
    `SELECT il.*
     FROM intake_links il
     WHERE il.scope_type = 'school'
       AND il.organization_id = ?
       AND COALESCE(il.form_type, 'intake') IN ('intake', 'public_form')
       AND LOWER(COALESCE(NULLIF(TRIM(il.language_code), ''), 'en')) = ?
       AND il.is_active = 1
     ORDER BY il.updated_at DESC, il.id DESC
     LIMIT 4`,
    [orgId, lang]
  );
  for (const row of rows || []) {
    const ft = String(row.form_type || 'intake').toLowerCase();
    if (ft === 'intake' && registrationStepInSteps(row.intake_steps)) continue;
    return row;
  }
  return null;
}

async function persistSchoolIntakeQrPublicKeys(schoolOrganizationId, keys = {}) {
  const orgId = parseInt(schoolOrganizationId, 10);
  if (!orgId) return;
  const nextKeys = {};
  for (const languageCode of ['en', 'es']) {
    const key = String(keys[languageCode] || '').trim();
    if (key) nextKeys[languageCode] = key;
  }
  if (!Object.keys(nextKeys).length) return;

  const [rows] = await pool.execute(
    `SELECT feature_flags FROM agencies WHERE id = ? LIMIT 1`,
    [orgId]
  );
  const flags = parseJsonObject(rows?.[0]?.feature_flags) || {};
  const existing = parseJsonObject(flags.intakeQrPublicKeys) || {};
  flags.intakeQrPublicKeys = { ...existing, ...nextKeys };
  await pool.execute(
    `UPDATE agencies SET feature_flags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [JSON.stringify(flags), orgId]
  );
}

function resolveReferralQrPublicKey(link = {}) {
  const customMessages = parseJsonObject(link.custom_messages);
  const referralKey = String(customMessages?.referralQrPublicKey || '').trim();
  if (referralKey) return referralKey;
  return String(link.public_key || '').trim();
}

/** Stable QR token for referral packets (template key when duplicated from a sibling). */
export function resolveSchoolIntakeQrPublicKey(link = {}) {
  return resolveReferralQrPublicKey(link);
}

async function duplicateAndActivate({
  source,
  targetOrgId,
  schoolName,
  languageCode,
  createdByUserId,
  reuseSourcePublicKey = false
}) {
  const lang = languageCode === 'es' ? 'es' : 'en';
  const label = lang === 'es' ? 'Spanish' : 'English';
  const targetName = String(schoolName || 'School').trim() || 'School';
  const baseTitle = source.title
    ? String(source.title).replace(/\s*\(Copy\)\s*$/i, '').trim()
    : `Digital intake (${label})`;
  const title = `${targetName} — Digital intake (${label})`;

  const sourcePublicKey = String(source.public_key || '').trim();
  let publicKey = crypto.randomBytes(24).toString('hex');
  let qrPublicKey = sourcePublicKey || publicKey;
  let customMessages = parseJsonObject(source.custom_messages) || {};

  if (reuseSourcePublicKey && sourcePublicKey) {
    const existing = await IntakeLink.findByPublicKey(sourcePublicKey);
    const existingOrgId = parseInt(existing?.organization_id || 0, 10);
    const targetId = parseInt(targetOrgId, 10);
    if (!existing || existingOrgId === targetId) {
      publicKey = sourcePublicKey;
      qrPublicKey = sourcePublicKey;
    } else {
      customMessages = {
        ...customMessages,
        referralQrPublicKey: sourcePublicKey
      };
      qrPublicKey = sourcePublicKey;
    }
  } else {
    qrPublicKey = publicKey;
  }

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
    customMessages,
    createdByUserId: createdByUserId || null
  });
  return { link, qrPublicKey };
}

function serializeBootstrapLink({ link, languageCode, source, skipped = false, qrPublicKey = null }) {
  return {
    id: link.id,
    title: link.title,
    languageCode,
    publicKey: link.public_key,
    qrPublicKey: qrPublicKey || resolveReferralQrPublicKey(link),
    sourceLinkId: source?.id || null,
    sourceSchoolId: source?.organization_id || null,
    skipped
  };
}

/**
 * Copy the agency's most recently updated active EN + ES school intake forms onto a school.
 * Idempotent when onlyIfMissing is true — existing active links keep their QR tokens.
 */
export async function ensureDigitalIntakeFormsForSchool({
  agencyId,
  schoolOrganizationId,
  schoolName,
  createdByUserId = null,
  onlyIfMissing = false,
  reuseSourcePublicKey = true
}) {
  const result = { en: null, es: null, errors: [], qrPublicKeys: {} };
  const qrKeysToPersist = {};

  for (const languageCode of ['en', 'es']) {
    try {
      const existing = await findExistingSchoolIntakeLink({ schoolOrganizationId, languageCode });
      if (existing) {
        const qrPublicKey = resolveReferralQrPublicKey(existing);
        result[languageCode] = serializeBootstrapLink({
          link: existing,
          languageCode,
          source: null,
          skipped: true,
          qrPublicKey
        });
        if (qrPublicKey) qrKeysToPersist[languageCode] = qrPublicKey;
        if (onlyIfMissing) continue;
      }

      const source = await findMostRecentSiblingIntakeLink({
        agencyId,
        excludeOrgId: schoolOrganizationId,
        languageCode
      });
      if (!source) {
        result.errors.push(`No active ${languageCode.toUpperCase()} school intake form found to copy`);
        continue;
      }

      const sourceQrPublicKey = String(source.public_key || '').trim();
      if (sourceQrPublicKey) qrKeysToPersist[languageCode] = sourceQrPublicKey;

      if (existing && !onlyIfMissing) {
        result[languageCode] = serializeBootstrapLink({
          link: existing,
          languageCode,
          source,
          skipped: true,
          qrPublicKey: resolveReferralQrPublicKey(existing)
        });
        continue;
      }

      const { link, qrPublicKey } = await duplicateAndActivate({
        source,
        targetOrgId: schoolOrganizationId,
        schoolName,
        languageCode,
        createdByUserId,
        reuseSourcePublicKey
      });
      result[languageCode] = serializeBootstrapLink({
        link,
        languageCode,
        source,
        qrPublicKey
      });
      if (qrPublicKey) qrKeysToPersist[languageCode] = qrPublicKey;
    } catch (e) {
      console.error(`[schoolOnboardingIntakeBootstrap] ${languageCode} failed:`, e?.message || e);
      result.errors.push(`${languageCode}: ${e?.message || 'failed'}`);
    }
  }

  if (Object.keys(qrKeysToPersist).length) {
    try {
      await persistSchoolIntakeQrPublicKeys(schoolOrganizationId, qrKeysToPersist);
      result.qrPublicKeys = { ...qrKeysToPersist };
    } catch (e) {
      console.error('[schoolOnboardingIntakeBootstrap] persist qr keys failed:', e?.message || e);
      result.errors.push(`qr keys: ${e?.message || 'failed'}`);
    }
  }

  return result;
}

/** @deprecated Use ensureDigitalIntakeFormsForSchool */
export async function bootstrapDigitalIntakeFormsForSchool(args) {
  return ensureDigitalIntakeFormsForSchool({ ...args, onlyIfMissing: false });
}
