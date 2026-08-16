import pool from '../config/database.js';
import crypto from 'crypto';
import IntakeLink from './IntakeLink.model.js';
import { flattenIntakeFields } from '../data/counselingIntakeSelfEn.js';
import { mergeCounselingOfficeEnIntoSteps } from '../data/counselingIntakeDependentEn.js';

function normalizeLang(languageCode) {
  const raw = String(languageCode || 'en').trim().toLowerCase();
  return raw === 'es' || raw.startsWith('es') ? 'es' : 'en';
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function documentStepLooksLikeReplacedPacketDoc(title) {
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

const OFFICE_STRIP_STEP_TYPES = new Set(['school_roi', 'spanish_clarification']);

/**
 * Strip legacy uploaded packet PDFs and school-only steps; ensure packet_* + smart_disclosure.
 */
export function sanitizeOfficeMasterSteps(steps, templateNameById = null, languageCode = 'en') {
  let list = Array.isArray(steps) ? [...steps] : [];
  const hasSmartDisclosure = list.some((s) => ['smart_disclosure', 'disclosure'].includes(String(s?.type || '').toLowerCase()));
  list = list.filter((s) => {
    const t = String(s?.type || '').toLowerCase();
    if (OFFICE_STRIP_STEP_TYPES.has(t)) return false;
    if (t !== 'document') return true;
    const tid = Number(s?.templateId || s?.template_id || 0);
    const title =
      s?.title
      || s?.label
      || s?.name
      || (templateNameById && tid ? templateNameById.get(tid) : '')
      || '';
    const kind = documentStepLooksLikeReplacedPacketDoc(title);
    if (kind === 'hipaa' || kind === 'informed' || kind === 'policy') return false;
    if (kind === 'disclosure' && hasSmartDisclosure) return false;
    if (kind === 'hipaa') return false;
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
  return list;
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

export async function sanitizeOfficeMasterStepsAsync(steps, languageCode = 'en') {
  const map = await loadTemplateNameMap(steps);
  return sanitizeOfficeMasterSteps(steps, map, languageCode);
}

class AgencyOfficeIntakeMaster {
  static _tableExists = null;

  static async tableExists() {
    if (this._tableExists === true) return true;
    if (this._tableExists === false) return false;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agency_office_intake_masters'`
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
      `SELECT * FROM agency_office_intake_masters
       WHERE agency_id = ? AND language_code = ?
       LIMIT 1`,
      [aid, lang]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async findBestSeedLink(agencyId, languageCode = 'en') {
    const aid = Number(agencyId || 0);
    const lang = normalizeLang(languageCode);
    if (!aid) return null;
    const [rows] = await pool.execute(
      `SELECT il.*
       FROM intake_links il
       WHERE il.scope_type = 'agency'
         AND il.organization_id = ?
         AND (il.form_type IS NULL OR il.form_type IN ('intake', 'public_form', ''))
         AND COALESCE(il.is_office_master, 0) = 0
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

  static async ensureEditorShadowLink({
    agencyId,
    languageCode,
    title,
    intakeSteps,
    intakeFields,
    actorUserId = null,
    existingLinkId = null
  }) {
    const lang = normalizeLang(languageCode);
    const safeTitle = title || `Master Office Digital (${lang === 'es' ? 'ES' : 'EN'})`;
    if (existingLinkId) {
      const existing = await IntakeLink.findById(existingLinkId);
      if (existing) {
        await pool.execute(
          `UPDATE intake_links
           SET title = ?,
               language_code = ?,
               intake_steps = ?,
               intake_fields = ?,
               is_office_master = 1,
               inherits_office_master = 0,
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
    const publicKey = `office-master-${agencyId}-${lang}-${crypto.randomBytes(8).toString('hex')}`;
    const link = await IntakeLink.create({
      publicKey,
      title: safeTitle,
      description: null,
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
      createdByUserId: actorUserId,
      isOfficeMaster: true,
      inheritsOfficeMaster: false
    });
    return IntakeLink.findById(link.id);
  }

  static async ensurePublishedShell({
    agencyId,
    languageCode,
    title,
    actorUserId = null,
    existingLinkId = null
  }) {
    const lang = normalizeLang(languageCode);
    const safeTitle = title || `In-Depth Intake (${lang === 'es' ? 'ES' : 'EN'})`;
    if (existingLinkId) {
      const existing = await IntakeLink.findById(existingLinkId);
      if (existing) {
        await pool.execute(
          `UPDATE intake_links
           SET title = ?,
               language_code = ?,
               inherits_office_master = 1,
               is_office_master = 0,
               scope_type = 'agency',
               organization_id = ?,
               form_type = 'intake',
               is_active = 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [safeTitle, lang, agencyId, existingLinkId]
        );
        return IntakeLink.findById(existingLinkId);
      }
    }
    const publicKey = `office-intake-${agencyId}-${lang}-${crypto.randomBytes(8).toString('hex')}`;
    const link = await IntakeLink.create({
      publicKey,
      title: safeTitle,
      description: null,
      languageCode: lang,
      scopeType: 'agency',
      formType: 'intake',
      organizationId: agencyId,
      isActive: true,
      createClient: true,
      createGuardian: true,
      requiresAssignment: true,
      createdByUserId: actorUserId,
      inheritsOfficeMaster: true,
      isOfficeMaster: false
    });
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
      const err = new Error('agency_office_intake_masters table missing — run migrations');
      err.status = 409;
      throw err;
    }
    const lang = normalizeLang(languageCode);
    const steps = await sanitizeOfficeMasterStepsAsync(intakeSteps, lang);
    const existing = await this.findByAgencyLanguage(aid, lang);
    const nextVersion = existing && bumpVersion ? Number(existing.version || 1) + 1 : (existing?.version || 1);
    const safeTitle = title || existing?.title || `Master Office Digital (${lang === 'es' ? 'ES' : 'EN'})`;

    const shadow = await this.ensureEditorShadowLink({
      agencyId: aid,
      languageCode: lang,
      title: safeTitle,
      intakeSteps: steps,
      intakeFields: intakeFields ?? existing?.intake_fields ?? null,
      actorUserId,
      existingLinkId: existing?.editor_intake_link_id || null
    });

    const publishedShell = await this.ensurePublishedShell({
      agencyId: aid,
      languageCode: lang,
      title: safeTitle,
      actorUserId,
      existingLinkId: existing?.published_intake_link_id || null
    });

    if (existing) {
      await pool.execute(
        `UPDATE agency_office_intake_masters
         SET title = ?,
             intake_steps = ?,
             intake_fields = ?,
             version = ?,
             editor_intake_link_id = ?,
             published_intake_link_id = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          safeTitle,
          JSON.stringify(steps),
          intakeFields != null ? JSON.stringify(intakeFields) : (existing.intake_fields ? JSON.stringify(existing.intake_fields) : null),
          nextVersion,
          shadow?.id || existing.editor_intake_link_id || null,
          publishedShell?.id || existing.published_intake_link_id || null,
          actorUserId || null,
          existing.id
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO agency_office_intake_masters
           (agency_id, language_code, title, intake_steps, intake_fields, version,
            editor_intake_link_id, published_intake_link_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          aid,
          lang,
          safeTitle,
          JSON.stringify(steps),
          intakeFields != null ? JSON.stringify(intakeFields) : null,
          1,
          shadow?.id || null,
          publishedShell?.id || null,
          actorUserId || null
        ]
      );
    }
    return this.findByAgencyLanguage(aid, lang);
  }

  static async getOrCreateForAgency(agencyId, { languageCode = 'en', actorUserId = null } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return null;
    const lang = normalizeLang(languageCode);
    const existing = await this.findByAgencyLanguage(aid, lang);
    if (existing) {
      const sanitized = await sanitizeOfficeMasterStepsAsync(existing.intake_steps, lang);
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
      if (!existing.editor_intake_link_id || !existing.published_intake_link_id) {
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
    const steps = await sanitizeOfficeMasterStepsAsync(seed?.intake_steps || [], lang);
    const fields = seed?.intake_fields || null;
    const title = lang === 'es'
      ? 'Master Office Digital (ES)'
      : 'Master Office Digital (EN)';
    const defaultSteps = [
      { type: 'questions', label: 'Questionnaire', visibility: 'always', fields: [] },
      { type: 'communications', label: 'Communications', visibility: 'always' },
      { type: 'guardian_waivers', label: 'Guardian Waivers', visibility: 'always' },
      { type: 'insurance', label: 'Insurance', visibility: 'always' },
      { type: 'packet_informed_group_consent', label: 'Informed Consent and Group Counseling Consent', visibility: 'always' },
      { type: 'packet_policy_services', label: 'Policy and Services Agreement', visibility: 'always' },
      { type: 'packet_hipaa_notice', label: 'HIPAA Privacy Policy and Notice of Privacy Practices', visibility: 'always' },
      { type: 'smart_disclosure', label: 'Disclosure Statement', visibility: 'always' }
    ];
    return this.upsertContent({
      agencyId: aid,
      languageCode: lang,
      title,
      intakeSteps: steps.length ? steps : await sanitizeOfficeMasterStepsAsync(defaultSteps, lang),
      intakeFields: fields,
      actorUserId,
      bumpVersion: false
    });
  }

  static async applyMasterToLink(link, { agencyId = null } = {}) {
    if (!link) return link;
    const inherits = Number(link.inherits_office_master || 0) === 1;
    if (!inherits) return link;
    const aid = Number(agencyId || link.organization_id || 0);
    if (!aid) return link;
    const master = await this.getOrCreateForAgency(aid, { languageCode: link.language_code || 'en' });
    if (!master) return link;
    const lang = normalizeLang(link.language_code || 'en');
    const intakeSteps = lang === 'en'
      ? mergeCounselingOfficeEnIntoSteps(master.intake_steps || [])
      : (master.intake_steps || []);
    const intakeFields = lang === 'en' ? flattenIntakeFields(intakeSteps) : master.intake_fields;
    return {
      ...link,
      intake_steps: intakeSteps,
      intake_fields: intakeFields,
      master_form_version: master.version,
      master_form_id: master.id,
      title: link.title || master.title
    };
  }
}

export default AgencyOfficeIntakeMaster;
