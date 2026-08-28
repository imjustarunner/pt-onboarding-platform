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
        school_roi_emails_require_approval: 1,
        default_sender_identity_id: null,
        template_sender_identity_json: null,
        personal_email_digest_enabled: 1,
        personal_email_digest_business_hours: 24,
        hold_staff_school_outside_availability: 1,
        client_ooo_auto_reply_enabled: 1,
        client_ooo_template: null,
        client_ooo_support_keyword: 'SUPPORT',
        unknown_sender_box_enabled: 1,
        secure_message_sender_identity_id: null,
        noreply_sender_identity_id: null,
        intent_review_enabled: 1,
        intent_confidence_threshold: 0.75,
        quick_view_enabled: 1,
        secure_client_message_email_enabled: 1,
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
      personal_email_digest_enabled: row.personal_email_digest_enabled === undefined ? 1 : row.personal_email_digest_enabled,
      personal_email_digest_business_hours: Number(row.personal_email_digest_business_hours || 24),
      hold_staff_school_outside_availability:
        row.hold_staff_school_outside_availability === undefined ? 1 : row.hold_staff_school_outside_availability,
      client_ooo_auto_reply_enabled: row.client_ooo_auto_reply_enabled === undefined ? 1 : row.client_ooo_auto_reply_enabled,
      client_ooo_support_keyword: row.client_ooo_support_keyword || 'SUPPORT',
      unknown_sender_box_enabled: row.unknown_sender_box_enabled === undefined ? 1 : row.unknown_sender_box_enabled,
      intent_review_enabled: row.intent_review_enabled === undefined ? 1 : row.intent_review_enabled,
      intent_confidence_threshold: Number(row.intent_confidence_threshold ?? 0.75),
      quick_view_enabled: row.quick_view_enabled === undefined ? 1 : row.quick_view_enabled,
      secure_client_message_email_enabled:
        row.secure_client_message_email_enabled === undefined ? 1 : row.secure_client_message_email_enabled,
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

  static bool01(v, defaultTrue = true) {
    if (v === undefined) return defaultTrue ? 1 : 0;
    return v === false || v === 0 || v === '0' ? 0 : 1;
  }

  static async update({
    agencyId,
    notificationsEnabled,
    schoolRoiEmailsRequireApproval,
    aiDraftPolicyMode,
    allowSchoolOverrides,
    aiAllowedIntents,
    aiMatchConfidenceThreshold,
    aiAllowedSenderIdentityKeys,
    defaultSenderIdentityId,
    templateSenderIdentityJson,
    personalEmailDigestEnabled,
    personalEmailDigestBusinessHours,
    holdStaffSchoolOutsideAvailability,
    clientOooAutoReplyEnabled,
    clientOooTemplate,
    clientOooSupportKeyword,
    unknownSenderBoxEnabled,
    secureMessageSenderIdentityId,
    noreplySenderIdentityId,
    intentReviewEnabled,
    intentConfidenceThreshold,
    quickViewEnabled,
    secureClientMessageEmailEnabled,
    actorUserId
  }) {
    const exists = await this.tableExists();
    if (!exists) {
      const err = new Error('Database missing agency_email_settings table. Run database/migrations/348_create_email_settings_tables.sql.');
      err.status = 409;
      throw err;
    }
    const enabledVal = this.bool01(notificationsEnabled, true);
    const roiApprovalVal = this.bool01(schoolRoiEmailsRequireApproval, true);
    const policyMode = String(aiDraftPolicyMode || 'human_only').trim().toLowerCase() || 'human_only';
    const schoolOverridesVal = this.bool01(allowSchoolOverrides, true);
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
    const defaultSenderId = defaultSenderIdentityId === null || defaultSenderIdentityId === undefined || defaultSenderIdentityId === ''
      ? null
      : Number(defaultSenderIdentityId);
    const templateSenderJson = templateSenderIdentityJson === undefined
      ? null
      : (templateSenderIdentityJson && typeof templateSenderIdentityJson === 'object'
        ? JSON.stringify(templateSenderIdentityJson)
        : null);

    const [existingRows] = await pool.execute(
      'SELECT * FROM agency_email_settings WHERE agency_id = ? LIMIT 1',
      [agencyId]
    );
    const existing = existingRows?.[0] || {};
    const finalTemplateJson = templateSenderIdentityJson === undefined
      ? (existing.template_sender_identity_json || null)
      : templateSenderJson;

    const digestHoursRaw = personalEmailDigestBusinessHours !== undefined
      ? Number(personalEmailDigestBusinessHours)
      : Number(existing.personal_email_digest_business_hours || 24);
    const digestHours = Number.isFinite(digestHoursRaw) ? Math.min(168, Math.max(1, digestHoursRaw)) : 24;
    const intentThreshRaw = intentConfidenceThreshold !== undefined
      ? Number(intentConfidenceThreshold)
      : Number(existing.intent_confidence_threshold ?? 0.75);
    const intentThresh = Number.isFinite(intentThreshRaw)
      ? Math.min(0.99, Math.max(0.5, intentThreshRaw))
      : 0.75;
    const secureMsgId = secureMessageSenderIdentityId === undefined
      ? (existing.secure_message_sender_identity_id ?? null)
      : (secureMessageSenderIdentityId === null || secureMessageSenderIdentityId === ''
        ? null
        : Number(secureMessageSenderIdentityId));
    const noreplyId = noreplySenderIdentityId === undefined
      ? (existing.noreply_sender_identity_id ?? null)
      : (noreplySenderIdentityId === null || noreplySenderIdentityId === ''
        ? null
        : Number(noreplySenderIdentityId));
    const oooTemplate = clientOooTemplate === undefined
      ? (existing.client_ooo_template ?? null)
      : (clientOooTemplate == null ? null : String(clientOooTemplate));
    const oooKeyword = clientOooSupportKeyword === undefined
      ? (existing.client_ooo_support_keyword || 'SUPPORT')
      : String(clientOooSupportKeyword || 'SUPPORT').trim().toUpperCase().slice(0, 40) || 'SUPPORT';

    await pool.execute(
      `INSERT INTO agency_email_settings
        (agency_id, notifications_enabled, school_roi_emails_require_approval, ai_draft_policy_mode, allow_school_overrides,
         ai_allowed_intents_json, ai_match_confidence_threshold, ai_allowed_sender_identity_keys_json,
         default_sender_identity_id, template_sender_identity_json,
         personal_email_digest_enabled, personal_email_digest_business_hours,
         hold_staff_school_outside_availability, client_ooo_auto_reply_enabled, client_ooo_template,
         client_ooo_support_keyword, unknown_sender_box_enabled,
         secure_message_sender_identity_id, noreply_sender_identity_id,
         intent_review_enabled, intent_confidence_threshold,
         quick_view_enabled, secure_client_message_email_enabled,
         updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         notifications_enabled = VALUES(notifications_enabled),
         school_roi_emails_require_approval = VALUES(school_roi_emails_require_approval),
         ai_draft_policy_mode = VALUES(ai_draft_policy_mode),
         allow_school_overrides = VALUES(allow_school_overrides),
         ai_allowed_intents_json = VALUES(ai_allowed_intents_json),
         ai_match_confidence_threshold = VALUES(ai_match_confidence_threshold),
         ai_allowed_sender_identity_keys_json = VALUES(ai_allowed_sender_identity_keys_json),
         default_sender_identity_id = VALUES(default_sender_identity_id),
         template_sender_identity_json = VALUES(template_sender_identity_json),
         personal_email_digest_enabled = VALUES(personal_email_digest_enabled),
         personal_email_digest_business_hours = VALUES(personal_email_digest_business_hours),
         hold_staff_school_outside_availability = VALUES(hold_staff_school_outside_availability),
         client_ooo_auto_reply_enabled = VALUES(client_ooo_auto_reply_enabled),
         client_ooo_template = VALUES(client_ooo_template),
         client_ooo_support_keyword = VALUES(client_ooo_support_keyword),
         unknown_sender_box_enabled = VALUES(unknown_sender_box_enabled),
         secure_message_sender_identity_id = VALUES(secure_message_sender_identity_id),
         noreply_sender_identity_id = VALUES(noreply_sender_identity_id),
         intent_review_enabled = VALUES(intent_review_enabled),
         intent_confidence_threshold = VALUES(intent_confidence_threshold),
         quick_view_enabled = VALUES(quick_view_enabled),
         secure_client_message_email_enabled = VALUES(secure_client_message_email_enabled),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        enabledVal,
        roiApprovalVal,
        policyMode,
        schoolOverridesVal,
        allowedIntentsJson,
        threshold,
        allowedSenderIdentityKeysJson,
        defaultSenderId,
        finalTemplateJson,
        personalEmailDigestEnabled === undefined
          ? this.bool01(existing.personal_email_digest_enabled, true)
          : this.bool01(personalEmailDigestEnabled, true),
        digestHours,
        holdStaffSchoolOutsideAvailability === undefined
          ? this.bool01(existing.hold_staff_school_outside_availability, true)
          : this.bool01(holdStaffSchoolOutsideAvailability, true),
        clientOooAutoReplyEnabled === undefined
          ? this.bool01(existing.client_ooo_auto_reply_enabled, true)
          : this.bool01(clientOooAutoReplyEnabled, true),
        oooTemplate,
        oooKeyword,
        unknownSenderBoxEnabled === undefined
          ? this.bool01(existing.unknown_sender_box_enabled, true)
          : this.bool01(unknownSenderBoxEnabled, true),
        secureMsgId,
        noreplyId,
        intentReviewEnabled === undefined
          ? this.bool01(existing.intent_review_enabled, true)
          : this.bool01(intentReviewEnabled, true),
        intentThresh,
        quickViewEnabled === undefined
          ? this.bool01(existing.quick_view_enabled, true)
          : this.bool01(quickViewEnabled, true),
        secureClientMessageEmailEnabled === undefined
          ? this.bool01(existing.secure_client_message_email_enabled, true)
          : this.bool01(secureClientMessageEmailEnabled, true),
        actorUserId || null
      ]
    );
    return await this.getByAgencyId(agencyId);
  }
}

export default AgencyEmailSettings;
