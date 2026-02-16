import pool from '../config/database.js';

class SchoolEmailAiPolicyOverride {
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
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_email_ai_policy_overrides'"
      );
      return Number(rows?.[0]?.cnt || 0) > 0;
    } catch {
      return false;
    }
  }

  static async listByAgencyId(agencyId) {
    const exists = await this.tableExists();
    if (!exists) return [];
    const aid = parseInt(agencyId, 10);
    if (!aid) return [];
    const [rows] = await pool.execute(
      `SELECT o.*, s.name AS school_name
       FROM school_email_ai_policy_overrides o
       LEFT JOIN agencies s ON s.id = o.school_organization_id
       WHERE o.agency_id = ?
       ORDER BY s.name ASC, o.school_organization_id ASC`,
      [aid]
    );
    return (rows || []).map((row) => ({
      ...row,
      allowed_intents_json: this.parseJsonMaybe(row.allowed_intents_json) || null,
      match_confidence_threshold: row.match_confidence_threshold !== null && row.match_confidence_threshold !== undefined
        ? Number(row.match_confidence_threshold)
        : null,
      allowed_sender_identity_keys_json: this.parseJsonMaybe(row.allowed_sender_identity_keys_json) || null
    }));
  }

  static async findActiveBySchoolId(schoolOrganizationId) {
    const exists = await this.tableExists();
    if (!exists) return null;
    const sid = parseInt(schoolOrganizationId, 10);
    if (!sid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM school_email_ai_policy_overrides
       WHERE school_organization_id = ?
         AND is_active = TRUE
       LIMIT 1`,
      [sid]
    );
    const row = rows?.[0] || null;
    if (!row) return null;
    return {
      ...row,
      allowed_intents_json: this.parseJsonMaybe(row.allowed_intents_json) || null,
      match_confidence_threshold: row.match_confidence_threshold !== null && row.match_confidence_threshold !== undefined
        ? Number(row.match_confidence_threshold)
        : null,
      allowed_sender_identity_keys_json: this.parseJsonMaybe(row.allowed_sender_identity_keys_json) || null
    };
  }

  static async upsert({
    agencyId,
    schoolOrganizationId,
    policyMode,
    allowedIntents = null,
    matchConfidenceThreshold = null,
    allowedSenderIdentityKeys = null,
    isActive = true,
    updatedByUserId = null
  }) {
    const exists = await this.tableExists();
    if (!exists) {
      const err = new Error('Database missing school_email_ai_policy_overrides table. Run database/migrations/418_email_ai_policy_and_ticket_drafts.sql.');
      err.status = 409;
      throw err;
    }
    const aid = parseInt(agencyId, 10);
    const sid = parseInt(schoolOrganizationId, 10);
    if (!aid || !sid) {
      const err = new Error('agencyId and schoolOrganizationId are required');
      err.status = 400;
      throw err;
    }
    await pool.execute(
      `INSERT INTO school_email_ai_policy_overrides
        (agency_id, school_organization_id, policy_mode, allowed_intents_json, match_confidence_threshold, allowed_sender_identity_keys_json, is_active, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         agency_id = VALUES(agency_id),
         policy_mode = VALUES(policy_mode),
         allowed_intents_json = VALUES(allowed_intents_json),
         match_confidence_threshold = VALUES(match_confidence_threshold),
         allowed_sender_identity_keys_json = VALUES(allowed_sender_identity_keys_json),
         is_active = VALUES(is_active),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        aid,
        sid,
        String(policyMode || '').trim(),
        Array.isArray(allowedIntents) ? JSON.stringify(allowedIntents.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)) : null,
        matchConfidenceThreshold === null || matchConfidenceThreshold === undefined
          ? null
          : Math.min(0.99, Math.max(0.5, Number(matchConfidenceThreshold) || 0.75)),
        Array.isArray(allowedSenderIdentityKeys)
          ? JSON.stringify(allowedSenderIdentityKeys.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))
          : null,
        isActive ? 1 : 0,
        updatedByUserId
      ]
    );
    const [rows] = await pool.execute(
      `SELECT o.*, s.name AS school_name
       FROM school_email_ai_policy_overrides o
       LEFT JOIN agencies s ON s.id = o.school_organization_id
       WHERE o.school_organization_id = ?
       LIMIT 1`,
      [sid]
    );
    const row = rows?.[0] || null;
    if (!row) return null;
    return {
      ...row,
      allowed_intents_json: this.parseJsonMaybe(row.allowed_intents_json) || null,
      match_confidence_threshold: row.match_confidence_threshold !== null && row.match_confidence_threshold !== undefined
        ? Number(row.match_confidence_threshold)
        : null,
      allowed_sender_identity_keys_json: this.parseJsonMaybe(row.allowed_sender_identity_keys_json) || null
    };
  }

  static async removeBySchoolId(schoolOrganizationId) {
    const exists = await this.tableExists();
    if (!exists) return 0;
    const sid = parseInt(schoolOrganizationId, 10);
    if (!sid) return 0;
    const [result] = await pool.execute(
      `DELETE FROM school_email_ai_policy_overrides
       WHERE school_organization_id = ?`,
      [sid]
    );
    return Number(result?.affectedRows || 0);
  }
}

export default SchoolEmailAiPolicyOverride;
