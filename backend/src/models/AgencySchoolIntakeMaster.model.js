import pool from '../config/database.js';
import crypto from 'crypto';
import IntakeLink from './IntakeLink.model.js';
import {
  ensureSpanishClarificationFirst,
  localizeSchoolReferralPacketTitle,
  resolveRequestedMasterLanguage
} from '../utils/schoolIntakeMasterLanguage.js';

function normalizeLang(languageCode) {
  const raw = String(languageCode || 'en').trim().toLowerCase();
  return raw === 'es' || raw.startsWith('es') ? 'es' : 'en';
}

export { resolveRequestedMasterLanguage };

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function documentStepLooksLikeReplacedPacketDoc(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return false;
  if (
    t.includes('hipaa')
    || t.includes('privacy practices')
    || t.includes('privacy policy')
    || t.includes('aviso de prácticas')
    || t.includes('aviso de practicas')
    || t.includes('notice of privacy')
  ) return 'hipaa';
  if (t.includes('informed consent') || t.includes('consentimiento informado') || t.includes('group counseling')) {
    return 'informed';
  }
  if (t.includes('policy and services') || t.includes('política y servicios') || t.includes('politica y servicios')) {
    return 'policy';
  }
  if (t.includes('disclosure') || t.includes('divulgación') || t.includes('divulgacion')) {
    return 'disclosure';
  }
  return false;
}

function parseSteps(linkOrSteps) {
  if (Array.isArray(linkOrSteps)) return linkOrSteps;
  const raw = linkOrSteps?.intake_steps;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hasStepType(steps, type) {
  const want = String(type || '').toLowerCase();
  return (Array.isArray(steps) ? steps : []).some((s) => String(s?.type || '').toLowerCase() === want);
}

function packetSectionPresent(intakeData, sectionKey, flatKey) {
  const nested = intakeData?.packetSections && typeof intakeData.packetSections === 'object'
    ? intakeData.packetSections[sectionKey]
    : null;
  const flat = intakeData?.[flatKey];
  return !!(nested || flat);
}

/**
 * Live packet / smart-disclosure coverage from programmed steps or already-captured
 * signatures. Used so submit does not still demand the retired "(School)" PDFs.
 */
export function livePacketCoverage(link, intakeData = null) {
  const steps = parseSteps(link);
  return {
    informed: hasStepType(steps, 'packet_informed_group_consent')
      || packetSectionPresent(intakeData, 'informed_group_consent', 'packetInformedGroupConsent'),
    policy: hasStepType(steps, 'packet_policy_services')
      || packetSectionPresent(intakeData, 'policy_services', 'packetPolicyServices'),
    hipaa: hasStepType(steps, 'packet_hipaa_notice')
      || packetSectionPresent(intakeData, 'hipaa_notice', 'packetHipaaNotice'),
    disclosure: hasStepType(steps, 'smart_disclosure')
      || hasStepType(steps, 'disclosure')
      || !!(intakeData?.smartDisclosure)
  };
}

export function shouldKeepLegacyPacketDocument({ title, link, intakeData } = {}) {
  const kind = documentStepLooksLikeReplacedPacketDoc(title);
  if (!kind) return true;
  const coverage = livePacketCoverage(link, intakeData);
  if (kind === 'informed') return !coverage.informed;
  if (kind === 'policy') return !coverage.policy;
  if (kind === 'hipaa') return !coverage.hipaa;
  if (kind === 'disclosure') return !coverage.disclosure;
  return true;
}

/**
 * Strip legacy uploaded packet PDFs (HIPAA / informed / policy / disclosure)
 * now covered by live packet or smart_disclosure steps, and ensure packet_* steps exist.
 */
export function sanitizeSchoolMasterSteps(steps, templateNameById = null, languageCode = 'en') {
  let list = Array.isArray(steps) ? [...steps] : [];
  const lang = String(languageCode || 'en').toLowerCase();
  list = list.filter((s) => {
    const t = String(s?.type || '').toLowerCase();
    if (t !== 'document') return true;
    const tid = Number(s?.templateId || s?.template_id || 0);
    const title =
      s?.title
      || s?.label
      || s?.name
      || (templateNameById && tid ? templateNameById.get(tid) : '')
      || '';
    const kind = documentStepLooksLikeReplacedPacketDoc(title);
    if (kind === 'hipaa' || kind === 'informed' || kind === 'policy' || kind === 'disclosure') return false;
    return true;
  });

  const hasType = (type) => list.some((s) => String(s?.type || '').toLowerCase() === type);
  if (!hasType('packet_informed_group_consent')) {
    list.push({
      type: 'packet_informed_group_consent',
      label: 'Informed Consent and Group Counseling Consent',
      visibility: 'always'
    });
  }
  if (!hasType('packet_policy_services')) {
    list.push({
      type: 'packet_policy_services',
      label: 'Policy and Services Agreement',
      visibility: 'always'
    });
  }
  if (!hasType('packet_hipaa_notice')) {
    list.push({
      type: 'packet_hipaa_notice',
      label: 'HIPAA Privacy Policy and Notice of Privacy Practices',
      visibility: 'always'
    });
  }
  if (!hasType('smart_disclosure') && !hasType('disclosure')) {
    list.push({ type: 'smart_disclosure', title: 'Disclosure Statement', visibility: 'always' });
  }
  return ensureSpanishClarificationFirst(list, lang);
}

async function loadTemplateNameMap(steps) {
  const ids = (Array.isArray(steps) ? steps : [])
    .filter((s) => String(s?.type || '').toLowerCase() === 'document')
    .map((s) => Number(s?.templateId || s?.template_id || 0))
    .filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;
  try {
    const DocumentTemplate = (await import('./DocumentTemplate.model.js')).default;
    for (const id of [...new Set(ids)]) {
      const row = await DocumentTemplate.findById(id);
      if (row) map.set(id, row.name || row.title || '');
    }
  } catch {
    /* ignore */
  }
  return map;
}

export async function sanitizeSchoolMasterStepsAsync(steps, languageCode = 'en') {
  const map = await loadTemplateNameMap(steps);
  return sanitizeSchoolMasterSteps(steps, map, languageCode);
}

class AgencySchoolIntakeMaster {
  static _tableExists = null;

  static async tableExists() {
    if (this._tableExists === true) return true;
    if (this._tableExists === false) return false;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agency_school_intake_masters'`
      );
      this._tableExists = Number(rows?.[0]?.cnt || 0) > 0;
      return this._tableExists;
    } catch {
      this._tableExists = false;
      return false;
    }
  }

  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      language_code: normalizeLang(row.language_code),
      intake_steps: parseJson(row.intake_steps, []),
      intake_fields: parseJson(row.intake_fields, null),
      version: Number(row.version || 1)
    };
  }

  static async findByAgencyLanguage(agencyId, languageCode = 'en') {
    const aid = Number(agencyId || 0);
    if (!aid || !(await this.tableExists())) return null;
    const lang = normalizeLang(languageCode);
    const [rows] = await pool.execute(
      `SELECT * FROM agency_school_intake_masters
       WHERE agency_id = ? AND language_code = ?
       LIMIT 1`,
      [aid, lang]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async findByEditorLinkId(linkId) {
    const id = Number(linkId || 0);
    if (!id || !(await this.tableExists())) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM agency_school_intake_masters WHERE editor_intake_link_id = ? LIMIT 1`,
      [id]
    );
    return this.normalize(rows?.[0] || null);
  }

  /**
   * Pick the richest school-scoped intake link for an agency+language to seed the master.
   */
  static async findBestSeedLink(agencyId, languageCode = 'en') {
    const aid = Number(agencyId || 0);
    const lang = normalizeLang(languageCode);
    if (!aid) return null;
    const [rows] = await pool.execute(
      `SELECT il.*
       FROM intake_links il
       INNER JOIN agency_schools asx
         ON asx.school_organization_id = il.organization_id
        AND asx.agency_id = ?
        AND asx.is_active = 1
       WHERE il.scope_type = 'school'
         AND il.form_type = 'intake'
         AND COALESCE(il.is_school_master, 0) = 0
         AND LOWER(COALESCE(il.language_code, 'en')) = ?
       ORDER BY
         (CASE WHEN il.is_active = 1 THEN 0 ELSE 1 END),
         CHAR_LENGTH(COALESCE(CAST(il.intake_steps AS CHAR), '')) DESC,
         il.updated_at DESC,
         il.id DESC
       LIMIT 1`,
      [aid, lang]
    );
    return IntakeLink.normalize(rows?.[0] || null);
  }

  static async ensureEditorShadowLink({ agencyId, languageCode, title, intakeSteps, intakeFields, actorUserId = null, existingLinkId = null }) {
    const lang = normalizeLang(languageCode);
    const safeTitle = title || `School Referral Master (${lang === 'es' ? 'ES' : 'EN'})`;
    if (existingLinkId) {
      const existing = await IntakeLink.findById(existingLinkId);
      if (existing) {
        await pool.execute(
          `UPDATE intake_links
           SET title = ?,
               language_code = ?,
               intake_steps = ?,
               intake_fields = ?,
               is_school_master = 1,
               inherits_school_master = 0,
               scope_type = 'agency',
               organization_id = ?,
               form_type = 'intake',
               is_active = 0,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            safeTitle,
            lang,
            JSON.stringify(intakeSteps || []),
            intakeFields ? JSON.stringify(intakeFields) : null,
            agencyId,
            existingLinkId
          ]
        );
        return IntakeLink.findById(existingLinkId);
      }
    }
    const publicKey = `school-master-${agencyId}-${lang}-${crypto.randomBytes(8).toString('hex')}`;
    const link = await IntakeLink.create({
      publicKey,
      title: safeTitle,
      description: 'Agency master school referral digital form (not for public sharing — school shells inherit this).',
      languageCode: lang,
      scopeType: 'agency',
      formType: 'intake',
      organizationId: agencyId,
      isActive: false,
      createClient: true,
      createGuardian: true,
      requiresAssignment: true,
      intakeFields,
      intakeSteps: intakeSteps || [],
      createdByUserId: actorUserId
    });
    try {
      await pool.execute(
        `UPDATE intake_links SET is_school_master = 1, inherits_school_master = 0 WHERE id = ?`,
        [link.id]
      );
    } catch {
      // columns may not exist yet during migration race
    }
    return IntakeLink.findById(link.id);
  }

  static async upsertContent({
    agencyId,
    languageCode = 'en',
    title = null,
    intakeSteps = null,
    intakeFields = null,
    actorUserId = null,
    bumpVersion = true
  }) {
    const aid = Number(agencyId || 0);
    if (!aid) {
      const err = new Error('Invalid agencyId');
      err.status = 400;
      throw err;
    }
    if (!(await this.tableExists())) {
      const err = new Error('agency_school_intake_masters table missing — run migrations');
      err.status = 409;
      throw err;
    }
    const lang = normalizeLang(languageCode);
    const steps = await sanitizeSchoolMasterStepsAsync(intakeSteps, lang);
    const existing = await this.findByAgencyLanguage(aid, lang);
    const nextVersion = existing && bumpVersion ? Number(existing.version || 1) + 1 : (existing?.version || 1);
    const safeTitle = title || existing?.title || `School Referral Master (${lang === 'es' ? 'ES' : 'EN'})`;

    const shadow = await this.ensureEditorShadowLink({
      agencyId: aid,
      languageCode: lang,
      title: safeTitle,
      intakeSteps: steps,
      intakeFields: intakeFields ?? existing?.intake_fields ?? null,
      actorUserId,
      existingLinkId: existing?.editor_intake_link_id || null
    });

    if (existing) {
      await pool.execute(
        `UPDATE agency_school_intake_masters
         SET title = ?,
             intake_steps = ?,
             intake_fields = ?,
             version = ?,
             editor_intake_link_id = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          safeTitle,
          JSON.stringify(steps),
          intakeFields != null ? JSON.stringify(intakeFields) : (existing.intake_fields ? JSON.stringify(existing.intake_fields) : null),
          nextVersion,
          shadow?.id || existing.editor_intake_link_id || null,
          actorUserId || null,
          existing.id
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO agency_school_intake_masters
           (agency_id, language_code, title, intake_steps, intake_fields, version, editor_intake_link_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          aid,
          lang,
          safeTitle,
          JSON.stringify(steps),
          intakeFields != null ? JSON.stringify(intakeFields) : null,
          1,
          shadow?.id || null,
          actorUserId || null
        ]
      );
    }
    return this.findByAgencyLanguage(aid, lang);
  }

  /**
   * Ensure a master exists for agency+lang, seeding from the best school link when needed.
   */
  static async getOrCreateForAgency(agencyId, { languageCode = 'en', actorUserId = null } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return null;
    const lang = normalizeLang(languageCode);
    const existing = await this.findByAgencyLanguage(aid, lang);
    if (existing) {
      await this.markAgencySchoolLinksInheriting(aid);
      // Keep sanitization current (HIPAA cleanup) without bumping version if unchanged structure needed
      const sanitized = await sanitizeSchoolMasterStepsAsync(existing.intake_steps, lang);
      const before = JSON.stringify(existing.intake_steps || []);
      const after = JSON.stringify(sanitized);
      if (before !== after) {
        return this.upsertContent({
          agencyId: aid,
          languageCode: lang,
          title: existing.title,
          intakeSteps: sanitized,
          intakeFields: existing.intake_fields,
          actorUserId,
          bumpVersion: true
        });
      }
      if (!existing.editor_intake_link_id) {
        return this.upsertContent({
          agencyId: aid,
          languageCode: lang,
          title: existing.title,
          intakeSteps: sanitized,
          intakeFields: existing.intake_fields,
          actorUserId,
          bumpVersion: false
        });
      }
      return existing;
    }

    const seed = await this.findBestSeedLink(aid, lang);
    const steps = await sanitizeSchoolMasterStepsAsync(seed?.intake_steps || [], lang);
    const fields = seed?.intake_fields || null;
    const title = lang === 'es'
      ? 'School Referral Master (ES)'
      : 'School Referral Master (EN)';
    const created = await this.upsertContent({
      agencyId: aid,
      languageCode: lang,
      title,
      intakeSteps: steps.length
        ? steps
        : await sanitizeSchoolMasterStepsAsync([
            { type: 'questions', label: 'Questionnaire', visibility: 'always', fields: [] },
            { type: 'school_roi', label: 'School ROI', visibility: 'always' },
            { type: 'smart_disclosure', label: 'Disclosure Statement', visibility: 'always' }
          ], lang),
      intakeFields: fields,
      actorUserId,
      bumpVersion: false
    });
    await this.markAgencySchoolLinksInheriting(aid);
    return created;
  }

  /**
   * Parent agency for a school org. Prefer organization_affiliations (current),
   * then the legacy agency_schools join. Many live schools are only in affiliations.
   */
  static async resolveParentAgencyIdForSchool(schoolOrganizationId) {
    const orgId = Number(schoolOrganizationId || 0);
    if (!orgId) return null;
    try {
      const { default: OrganizationAffiliation } = await import('./OrganizationAffiliation.model.js');
      const fromAff = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
      if (fromAff) return Number(fromAff) || null;
    } catch {
      /* ignore */
    }
    try {
      const { default: AgencySchool } = await import('./AgencySchool.model.js');
      const fromLegacy = await AgencySchool.getActiveAgencyIdForSchool(orgId);
      if (fromLegacy) return Number(fromLegacy) || null;
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * Flip school-scoped intake shells for this agency to live-inherit the master.
   */
  static async markAgencySchoolLinksInheriting(agencyId) {
    const aid = Number(agencyId || 0);
    if (!aid) return;
    try {
      await pool.execute(
        `UPDATE intake_links il
         SET il.inherits_school_master = 1
         WHERE il.scope_type = 'school'
           AND il.form_type = 'intake'
           AND COALESCE(il.is_school_master, 0) = 0
           AND (
             EXISTS (
               SELECT 1 FROM organization_affiliations oa
               WHERE oa.organization_id = il.organization_id
                 AND oa.agency_id = ?
                 AND oa.is_active = 1
             )
             OR EXISTS (
               SELECT 1 FROM agency_schools asx
               WHERE asx.school_organization_id = il.organization_id
                 AND asx.agency_id = ?
                 AND asx.is_active = 1
             )
           )`,
        [aid, aid]
      );
    } catch (e) {
      console.warn('[AgencySchoolIntakeMaster] markAgencySchoolLinksInheriting failed', e?.message || e);
    }
  }

  /**
   * Overlay master steps/fields onto a school shell intake link for public/runtime use.
   * Uses the published EN or ES master (already authored) — never live-translates.
   */
  static async applyMasterToLink(link, { agencyId = null, languageCode = null } = {}) {
    if (!link) return link;
    if (Number(link.is_school_master || 0) === 1) return link;
    const formType = String(link.form_type || 'intake').toLowerCase();
    const scope = String(link.scope_type || '').toLowerCase();
    const isSchoolIntakeShell = scope === 'school' && formType === 'intake';
    const inherits = Number(link.inherits_school_master || 0) === 1;
    if (!inherits && !isSchoolIntakeShell) return link;
    let aid = Number(agencyId || 0);
    if (!aid) {
      aid = await this.resolveParentAgencyIdForSchool(link.organization_id);
    }
    if (!aid) return link;
    const lang = resolveRequestedMasterLanguage(languageCode, link.language_code || 'en');
    const master = await this.getOrCreateForAgency(aid, { languageCode: lang });
    if (!master) return link;
    const esMaster = lang === 'es' ? master : await this.findByAgencyLanguage(aid, 'es');
    const hasSpanishMaster = !!(esMaster && Number(esMaster.id || 0));
    const steps = await sanitizeSchoolMasterStepsAsync(master.intake_steps, lang);
    const overlayTitle = lang === 'es' ? (master.title || link.title) : (link.title || master.title);
    return {
      ...link,
      intake_steps: steps,
      intake_fields: master.intake_fields,
      master_form_version: master.version,
      master_form_id: master.id,
      master_language_code: lang,
      has_spanish_master: hasSpanishMaster,
      inherits_school_master: 1,
      language_code: lang,
      title: localizeSchoolReferralPacketTitle(overlayTitle, lang)
    };
  }
}

export default AgencySchoolIntakeMaster;
