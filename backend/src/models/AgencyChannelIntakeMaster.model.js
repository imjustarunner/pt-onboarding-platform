import pool from '../config/database.js';
import crypto from 'crypto';
import IntakeLink from './IntakeLink.model.js';
import { CHANNEL_MASTER_KEYS, TUTORING_MASTER_FORM_TYPES } from '../constants/masterFormChannels.js';
import AgencyOfficeIntakeMaster from './AgencyOfficeIntakeMaster.model.js';

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

function looksLikeEmptyChannelMaster(steps) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return true;
  if (list.length === 1) {
    const only = list[0] || {};
    const fields = Array.isArray(only.fields) ? only.fields : [];
    return String(only.type || '') === 'questions' && fields.length === 0;
  }
  return false;
}

function parsePublishedLinkIds(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function tutoringShellTitle(formType, lang) {
  const loc = lang === 'es' ? 'ES' : 'EN';
  if (formType === 'assessment') return `Tutoring Assessment (${loc})`;
  if (formType === 'evaluation') return `Tutoring Evaluation (${loc})`;
  return `Tutoring Intake (${loc})`;
}

function normalizeChannel(channel) {
  const key = String(channel || '').trim().toLowerCase();
  if (!CHANNEL_MASTER_KEYS.includes(key)) {
    const err = new Error(`Invalid channel: ${channel}`);
    err.status = 400;
    throw err;
  }
  return key;
}

class AgencyChannelIntakeMaster {
  static _tableExists = null;

  static async tableExists() {
    if (this._tableExists === true) return true;
    if (this._tableExists === false) return false;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agency_channel_intake_masters'`
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
      channel: String(row.channel || '').toLowerCase(),
      language_code: normalizeLang(row.language_code),
      intake_steps: parseJson(row.intake_steps, []),
      intake_fields: parseJson(row.intake_fields, null),
      published_link_ids: parsePublishedLinkIds(row.published_link_ids),
      version: Number(row.version || 1),
      status: String(row.status || 'framed')
    };
  }

  static async findByAgencyChannelLanguage(agencyId, channel, languageCode = 'en') {
    const aid = Number(agencyId || 0);
    const ch = normalizeChannel(channel);
    if (!aid || !(await this.tableExists())) return null;
    const lang = normalizeLang(languageCode);
    const [rows] = await pool.execute(
      `SELECT * FROM agency_channel_intake_masters
       WHERE agency_id = ? AND channel = ? AND language_code = ?
       LIMIT 1`,
      [aid, ch, lang]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async listForAgency(agencyId) {
    const aid = Number(agencyId || 0);
    if (!aid || !(await this.tableExists())) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM agency_channel_intake_masters
       WHERE agency_id = ?
       ORDER BY channel ASC, language_code ASC`,
      [aid]
    );
    return (rows || []).map((row) => this.normalize(row));
  }

  static async ensureEditorShadowLink({
    agencyId,
    channel,
    languageCode,
    title,
    intakeSteps,
    intakeFields,
    actorUserId = null,
    existingLinkId = null
  }) {
    const lang = normalizeLang(languageCode);
    const ch = normalizeChannel(channel);
    const safeTitle = title || `Master ${ch.charAt(0).toUpperCase() + ch.slice(1)} (${lang === 'es' ? 'ES' : 'EN'})`;
    if (existingLinkId) {
      const existing = await IntakeLink.findById(existingLinkId);
      if (existing) {
        await pool.execute(
          `UPDATE intake_links
           SET title = ?,
               language_code = ?,
               intake_steps = ?,
               intake_fields = ?,
               master_channel = ?,
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
            ch,
            agencyId,
            existingLinkId
          ]
        );
        return IntakeLink.findById(existingLinkId);
      }
    }
    const publicKey = `channel-master-${ch}-${agencyId}-${lang}-${crypto.randomBytes(8).toString('hex')}`;
    const link = await IntakeLink.create({
      publicKey,
      title: safeTitle,
      description: `Framed ${ch} digital form master (not yet published).`,
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
      masterChannel: ch
    });
    return IntakeLink.findById(link.id);
  }

  static async upsertContent({
    agencyId,
    channel,
    languageCode = 'en',
    title = null,
    intakeSteps = null,
    intakeFields = null,
    status = null,
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
      const err = new Error('agency_channel_intake_masters table missing — run migrations');
      err.status = 409;
      throw err;
    }
    const ch = normalizeChannel(channel);
    const lang = normalizeLang(languageCode);
    const steps = Array.isArray(intakeSteps) ? intakeSteps : [];
    const existing = await this.findByAgencyChannelLanguage(aid, ch, lang);
    const nextVersion = existing && bumpVersion ? Number(existing.version || 1) + 1 : (existing?.version || 1);
    const safeTitle = title || existing?.title || `Master ${ch.charAt(0).toUpperCase() + ch.slice(1)} (${lang === 'es' ? 'ES' : 'EN'})`;
    const safeStatus = status || existing?.status || 'framed';

    const shadow = await this.ensureEditorShadowLink({
      agencyId: aid,
      channel: ch,
      languageCode: lang,
      title: safeTitle,
      intakeSteps: steps,
      intakeFields: intakeFields ?? existing?.intake_fields ?? null,
      actorUserId,
      existingLinkId: existing?.editor_intake_link_id || null
    });

    if (existing) {
      await pool.execute(
        `UPDATE agency_channel_intake_masters
         SET title = ?,
             intake_steps = ?,
             intake_fields = ?,
             version = ?,
             status = ?,
             editor_intake_link_id = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          safeTitle,
          JSON.stringify(steps),
          intakeFields != null ? JSON.stringify(intakeFields) : (existing.intake_fields ? JSON.stringify(existing.intake_fields) : null),
          nextVersion,
          safeStatus,
          shadow?.id || existing.editor_intake_link_id || null,
          actorUserId || null,
          existing.id
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO agency_channel_intake_masters
           (agency_id, channel, language_code, title, intake_steps, intake_fields, version, status,
            editor_intake_link_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          aid,
          ch,
          lang,
          safeTitle,
          JSON.stringify(steps),
          intakeFields != null ? JSON.stringify(intakeFields) : null,
          1,
          safeStatus,
          shadow?.id || null,
          actorUserId || null
        ]
      );
    }
    return this.findByAgencyChannelLanguage(aid, ch, lang);
  }

  static async persistPublishedShells(masterId, publishedIntakeLinkId, publishedLinkIds) {
    await pool.execute(
      `UPDATE agency_channel_intake_masters
       SET published_intake_link_id = ?, published_link_ids = ?
       WHERE id = ?`,
      [publishedIntakeLinkId || null, JSON.stringify(publishedLinkIds || {}), masterId]
    );
  }

  static async publishedColumnsReady() {
    try {
      const [rows] = await pool.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'agency_channel_intake_masters'
           AND COLUMN_NAME = 'published_intake_link_id'`
      );
      return Number(rows?.length || 0) > 0;
    } catch {
      return false;
    }
  }

  static async ensureTutoringPublishedShells(master, actorUserId = null) {
    if (!master?.id || String(master.channel || '') !== 'tutoring') return master;
    if (!(await this.publishedColumnsReady())) return master;
    const aid = Number(master.agency_id);
    const lang = normalizeLang(master.language_code);
    const existingIds = parsePublishedLinkIds(master.published_link_ids);
    const nextIds = { ...existingIds };
    for (const formType of TUTORING_MASTER_FORM_TYPES) {
      const existingId = Number(nextIds[formType] || (formType === 'intake' ? master.published_intake_link_id : 0) || 0);
      let link = existingId ? await IntakeLink.findById(existingId) : null;
      if (link) {
        await pool.execute(
          `UPDATE intake_links
           SET title = ?,
               language_code = ?,
               form_type = ?,
               master_channel = 'tutoring',
               inherits_office_master = 0,
               is_office_master = 0,
               scope_type = 'agency',
               organization_id = ?,
               is_active = 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [tutoringShellTitle(formType, lang), lang, formType, aid, link.id]
        );
        nextIds[formType] = link.id;
        continue;
      }
      const publicKey = `tutoring-${formType}-${aid}-${lang}-${crypto.randomBytes(6).toString('hex')}`;
      link = await IntakeLink.create({
        publicKey,
        title: tutoringShellTitle(formType, lang),
        description: null,
        languageCode: lang,
        scopeType: 'agency',
        formType,
        organizationId: aid,
        isActive: true,
        createClient: true,
        createGuardian: true,
        requiresAssignment: true,
        createdByUserId: actorUserId,
        masterChannel: 'tutoring'
      });
      nextIds[formType] = link?.id || null;
    }
    await this.persistPublishedShells(master.id, nextIds.intake || null, nextIds);
    return this.findByAgencyChannelLanguage(aid, 'tutoring', lang);
  }

  static async seedTutoringFromCounseling(agencyId, languageCode) {
    const office = await AgencyOfficeIntakeMaster.findByAgencyLanguage(agencyId, languageCode)
      || await AgencyOfficeIntakeMaster.getOrCreateForAgency(agencyId, { languageCode });
    return {
      steps: Array.isArray(office?.intake_steps) ? office.intake_steps : [],
      fields: office?.intake_fields || null
    };
  }

  static async getOrCreateForAgency(agencyId, { channel, languageCode = 'en', actorUserId = null } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return null;
    const ch = normalizeChannel(channel);
    const lang = normalizeLang(languageCode);
    let existing = await this.findByAgencyChannelLanguage(aid, ch, lang);

    if (ch === 'tutoring') {
      const needsSeed = !existing || looksLikeEmptyChannelMaster(existing.intake_steps);
      const seed = needsSeed ? await this.seedTutoringFromCounseling(aid, lang) : null;
      existing = await this.upsertContent({
        agencyId: aid,
        channel: ch,
        languageCode: lang,
        title: existing?.title || `Master Tutoring (${lang === 'es' ? 'ES' : 'EN'})`,
        intakeSteps: seed ? seed.steps : (existing.intake_steps || []),
        intakeFields: seed ? seed.fields : existing.intake_fields,
        status: 'active',
        actorUserId,
        bumpVersion: false
      });
      return this.ensureTutoringPublishedShells(existing, actorUserId);
    }

    if (existing) {
      if (!existing.editor_intake_link_id) {
        return this.upsertContent({
          agencyId: aid,
          channel: ch,
          languageCode: lang,
          title: existing.title,
          intakeSteps: existing.intake_steps,
          intakeFields: existing.intake_fields,
          status: existing.status,
          actorUserId,
          bumpVersion: false
        });
      }
      return existing;
    }

    const minimalSteps = [{ type: 'questions', label: 'Questionnaire', fields: [] }];
    const title = `Master ${ch.charAt(0).toUpperCase() + ch.slice(1)} (${lang === 'es' ? 'ES' : 'EN'})`;
    return this.upsertContent({
      agencyId: aid,
      channel: ch,
      languageCode: lang,
      title,
      intakeSteps: minimalSteps,
      intakeFields: null,
      status: 'framed',
      actorUserId,
      bumpVersion: false
    });
  }

  static async applyMasterToLink(link, { agencyId = null } = {}) {
    if (!link) return link;
    const channel = String(link.master_channel || '').toLowerCase();
    if (channel !== 'tutoring') return link;
    const aid = Number(agencyId || link.organization_id || 0);
    if (!aid) return link;
    const { flattenIntakeFields } = await import('../data/counselingIntakeSelfEn.js');
    const { mergeCounselingOfficeEnIntoSteps } = await import('../data/counselingIntakeDependentEn.js');
    const master = await this.getOrCreateForAgency(aid, { channel: 'tutoring', languageCode: link.language_code || 'en' });
    if (!master) return link;
    const lang = normalizeLang(link.language_code || 'en');
    const intakeSteps = lang === 'en'
      ? mergeCounselingOfficeEnIntoSteps(master.intake_steps || [], { paymentOnly: true })
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

  static publishedPublicKeyFor(master, formType = 'intake') {
    const type = TUTORING_MASTER_FORM_TYPES.includes(formType) ? formType : 'intake';
    const ids = parsePublishedLinkIds(master?.published_link_ids);
    return Number(ids[type] || (type === 'intake' ? master?.published_intake_link_id : 0) || ids.intake || 0);
  }
}

export default AgencyChannelIntakeMaster;
