import pool from '../config/database.js';

class AgencyEmailSettings {
  static parseJsonMaybe(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    if (typeof v !== 'string') return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  static async tableExists() {
    try {
      const [rows] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agency_email_settings'"
      );
      return Number(rows?.[0]?.cnt || 0) > 0;
    } catch {
      return false;
    }
  }

  static async getByAgencyId(agencyId) {
    const exists = await this.tableExists();
    if (!exists) {
      return { agency_id: agencyId, notifications_enabled: 1, missingTable: true };
    }
    const [rows] = await pool.execute(
      'SELECT * FROM agency_email_settings WHERE agency_id = ? LIMIT 1',
      [agencyId]
    );
    const row = rows?.[0] || null;
    if (!row) {
      return {
        agency_id: agencyId,
        notifications_enabled: 1,
        ai_draft_policy_mode: 'human_only',
        allow_school_overrides: 1,
        ai_allowed_intents_json: ['school_status_request'],
        ai_match_confidence_threshold: 0.75,
        ai_allowed_sender_identity_keys_json: [],
        missingTable: false
      };
    }
    return {
      ...row,
      ai_draft_policy_mode: row.ai_draft_policy_mode || 'human_only',
      allow_school_overrides: row.allow_school_overrides === undefined ? 1 : row.allow_school_overrides,
      ai_allowed_intents_json: this.parseJsonMaybe(row.ai_allowed_intents_json) || ['school_status_request'],
      ai_match_confidence_threshold: Number(row.ai_match_confidence_threshold || 0.75),
      ai_allowed_sender_identity_keys_json: this.parseJsonMaybe(row.ai_allowed_sender_identity_keys_json) || [],
      missingTable: false
    };
  }

  static async listByAgencyIds(agencyIds = []) {
    const exists = await this.tableExists();
    if (!exists) {
      return (agencyIds || []).map((id) => ({
        agency_id: id,
        notifications_enabled: 1,
        ai_draft_policy_mode: 'human_only',
        allow_school_overrides: 1,
        ai_allowed_intents_json: ['school_status_request'],
        ai_match_confidence_threshold: 0.75,
        ai_allowed_sender_identity_keys_json: [],
        missingTable: true
      }));
    }
    if (!agencyIds || !agencyIds.length) return [];
    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT * FROM agency_email_settings WHERE agency_id IN (${placeholders})`,
      agencyIds
    );
    return (rows || []).map((row) => ({
      ...row,
      ai_draft_policy_mode: row.ai_draft_policy_mode || 'human_only',
      allow_school_overrides: row.allow_school_overrides === undefined ? 1 : row.allow_school_overrides,
      ai_allowed_intents_json: this.parseJsonMaybe(row.ai_allowed_intents_json) || ['school_status_request'],
      ai_match_confidence_threshold: Number(row.ai_match_confidence_threshold || 0.75),
      ai_allowed_sender_identity_keys_json: this.parseJsonMaybe(row.ai_allowed_sender_identity_keys_json) || []
    }));
  }

  static async update({
    agencyId,
    notificationsEnabled,
    aiDraftPolicyMode,
    allowSchoolOverrides,
    aiAllowedIntents,
    aiMatchConfidenceThreshold,
    aiAllowedSenderIdentityKeys,
    actorUserId
  }) {
    const exists = await this.tableExists();
    if (!exists) {
      const err = new Error('Database missing agency_email_settings table. Run database/migrations/348_create_email_settings_tables.sql.');
      err.status = 409;
      throw err;
    }
    const enabledVal = notificationsEnabled === false ? 0 : 1;
    const policyMode = String(aiDraftPolicyMode || 'human_only').trim().toLowerCase() || 'human_only';
    const schoolOverridesVal = allowSchoolOverrides === false ? 0 : 1;
    const allowedIntentsJson = JSON.stringify(
      Array.isArray(aiAllowedIntents) && aiAllowedIntents.length
        ? aiAllowedIntents.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : ['school_status_request']
    );
    const thresholdNum = Number(aiMatchConfidenceThreshold);
    const threshold = Number.isFinite(thresholdNum)
      ? Math.min(0.99, Math.max(0.5, thresholdNum))
      : 0.75;
    const allowedSenderIdentityKeysJson = JSON.stringify(
      Array.isArray(aiAllowedSenderIdentityKeys)
        ? aiAllowedSenderIdentityKeys.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : []
    );
    await pool.execute(
      `INSERT INTO agency_email_settings
        (agency_id, notifications_enabled, ai_draft_policy_mode, allow_school_overrides,
         ai_allowed_intents_json, ai_match_confidence_threshold, ai_allowed_sender_identity_keys_json, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         notifications_enabled = VALUES(notifications_enabled),
         ai_draft_policy_mode = VALUES(ai_draft_policy_mode),
         allow_school_overrides = VALUES(allow_school_overrides),
         ai_allowed_intents_json = VALUES(ai_allowed_intents_json),
         ai_match_confidence_threshold = VALUES(ai_match_confidence_threshold),
         ai_allowed_sender_identity_keys_json = VALUES(ai_allowed_sender_identity_keys_json),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, enabledVal, policyMode, schoolOverridesVal, allowedIntentsJson, threshold, allowedSenderIdentityKeysJson, actorUserId || null]
    );
    return await this.getByAgencyId(agencyId);
  }
}

export default AgencyEmailSettings;
