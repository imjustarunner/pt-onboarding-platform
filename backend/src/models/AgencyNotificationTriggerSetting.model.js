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
  static async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT id, agency_id, trigger_key, enabled, channels_json, recipients_json, sender_identity_id, created_at, updated_at
       FROM agency_notification_trigger_settings
       WHERE agency_id = ?
       ORDER BY trigger_key ASC`,
      [agencyId]
    );

    return (rows || []).map((r) => ({
      id: r.id,
      agencyId: r.agency_id,
      triggerKey: r.trigger_key,
      enabled: r.enabled === null || r.enabled === undefined ? null : !!r.enabled,
      channels: parseJsonMaybe(r.channels_json) || null,
      recipients: parseJsonMaybe(r.recipients_json) || null,
      senderIdentityId: r.sender_identity_id || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  static async upsert({ agencyId, triggerKey, enabled = null, channels = null, recipients = null, senderIdentityId = null }) {
    const enabledValue = enabled === null || enabled === undefined ? null : (enabled ? 1 : 0);
    const channelsJson = channels === null || channels === undefined ? null : JSON.stringify(channels);
    const recipientsJson = recipients === null || recipients === undefined ? null : JSON.stringify(recipients);
    const senderIdentityValue = senderIdentityId === null || senderIdentityId === undefined ? null : Number(senderIdentityId);

    await pool.execute(
      `INSERT INTO agency_notification_trigger_settings
        (agency_id, trigger_key, enabled, channels_json, recipients_json, sender_identity_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        enabled = VALUES(enabled),
        channels_json = VALUES(channels_json),
        recipients_json = VALUES(recipients_json),
        sender_identity_id = VALUES(sender_identity_id),
        updated_at = CURRENT_TIMESTAMP`,
      [agencyId, triggerKey, enabledValue, channelsJson, recipientsJson, senderIdentityValue]
    );

    const [rows] = await pool.execute(
      `SELECT id, agency_id, trigger_key, enabled, channels_json, recipients_json, sender_identity_id, created_at, updated_at
       FROM agency_notification_trigger_settings
       WHERE agency_id = ? AND trigger_key = ?
       LIMIT 1`,
      [agencyId, triggerKey]
    );
    const r = rows?.[0] || null;
    if (!r) return null;
    return {
      id: r.id,
      agencyId: r.agency_id,
      triggerKey: r.trigger_key,
      enabled: r.enabled === null || r.enabled === undefined ? null : !!r.enabled,
      channels: parseJsonMaybe(r.channels_json) || null,
      recipients: parseJsonMaybe(r.recipients_json) || null,
      senderIdentityId: r.sender_identity_id || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }
}

export default AgencyNotificationTriggerSetting;

