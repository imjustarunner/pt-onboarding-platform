import pool from '../config/database.js';
import crypto from 'crypto';
import IntakeLink from './IntakeLink.model.js';
import { FRAMED_MASTER_CHANNELS } from '../constants/masterFormChannels.js';

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

function normalizeChannel(channel) {
  const key = String(channel || '').trim().toLowerCase();
  if (!FRAMED_MASTER_CHANNELS.includes(key)) {
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

  static async getOrCreateForAgency(agencyId, { channel, languageCode = 'en', actorUserId = null } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return null;
    const ch = normalizeChannel(channel);
    const lang = normalizeLang(languageCode);
    const existing = await this.findByAgencyChannelLanguage(aid, ch, lang);
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
}

export default AgencyChannelIntakeMaster;
