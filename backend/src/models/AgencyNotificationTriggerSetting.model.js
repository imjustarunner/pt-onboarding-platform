import pool from '../config/database.js';

function parseJsonMaybe(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

class AgencyNotificationTriggerSetting {
  static mapRow(r) {
    if (!r) return null;
    return {
      id: r.id,
      agencyId: r.agency_id,
      triggerKey: r.trigger_key,
      enabled: r.enabled === null || r.enabled === undefined ? null : !!r.enabled,
      channels: parseJsonMaybe(r.channels_json) || null,
      recipients: parseJsonMaybe(r.recipients_json) || null,
      senderIdentityId: r.sender_identity_id || null,
      subjectOverride: r.subject_override != null ? String(r.subject_override) : null,
      requireApproval: r.require_approval === 1 || r.require_approval === true,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  static async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT id, agency_id, trigger_key, enabled, channels_json, recipients_json, sender_identity_id,
              subject_override, require_approval, created_at, updated_at
       FROM agency_notification_trigger_settings
       WHERE agency_id = ?
       ORDER BY trigger_key ASC`,
      [agencyId]
    );

    return (rows || []).map((r) => this.mapRow(r));
  }

  static async upsert({
    agencyId,
    triggerKey,
    enabled = null,
    channels = null,
    recipients = null,
    senderIdentityId = null,
    subjectOverride = undefined,
    requireApproval = undefined
  }) {
    const enabledValue = enabled === null || enabled === undefined ? null : (enabled ? 1 : 0);
    const channelsJson = channels === null || channels === undefined ? null : JSON.stringify(channels);
    const recipientsJson = recipients === null || recipients === undefined ? null : JSON.stringify(recipients);
    const senderIdentityValue = senderIdentityId === null || senderIdentityId === undefined ? null : Number(senderIdentityId);
    const subjectOverrideValue = subjectOverride === undefined
      ? undefined
      : (subjectOverride === null || String(subjectOverride).trim() === ''
        ? null
        : String(subjectOverride).trim().slice(0, 255));
    const requireApprovalValue = requireApproval === undefined
      ? undefined
      : (requireApproval ? 1 : 0);

    // Load existing so omitted optional fields are preserved on update.
    const [existingRows] = await pool.execute(
      `SELECT subject_override, require_approval
       FROM agency_notification_trigger_settings
       WHERE agency_id = ? AND trigger_key = ?
       LIMIT 1`,
      [agencyId, triggerKey]
    );
    const existing = existingRows?.[0] || null;
    const finalSubject = subjectOverrideValue === undefined
      ? (existing?.subject_override ?? null)
      : subjectOverrideValue;
    const finalRequireApproval = requireApprovalValue === undefined
      ? (existing ? (existing.require_approval ? 1 : 0) : 0)
      : requireApprovalValue;

    await pool.execute(
      `INSERT INTO agency_notification_trigger_settings
        (agency_id, trigger_key, enabled, channels_json, recipients_json, sender_identity_id, subject_override, require_approval)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        enabled = VALUES(enabled),
        channels_json = VALUES(channels_json),
        recipients_json = VALUES(recipients_json),
        sender_identity_id = VALUES(sender_identity_id),
        subject_override = VALUES(subject_override),
        require_approval = VALUES(require_approval),
        updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        triggerKey,
        enabledValue,
        channelsJson,
        recipientsJson,
        senderIdentityValue,
        finalSubject,
        finalRequireApproval
      ]
    );

    const [rows] = await pool.execute(
      `SELECT id, agency_id, trigger_key, enabled, channels_json, recipients_json, sender_identity_id,
              subject_override, require_approval, created_at, updated_at
       FROM agency_notification_trigger_settings
       WHERE agency_id = ? AND trigger_key = ?
       LIMIT 1`,
      [agencyId, triggerKey]
    );
    return this.mapRow(rows?.[0] || null);
  }
}

export default AgencyNotificationTriggerSetting;
