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

class NotificationTrigger {
  static async listAll() {
    const [rows] = await pool.execute(
      `SELECT trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json, created_at, updated_at
       FROM notification_triggers
       ORDER BY trigger_key ASC`
    );

    return (rows || []).map((r) => ({
      triggerKey: r.trigger_key,
      name: r.name,
      description: r.description,
      defaultEnabled: !!r.default_enabled,
      defaultChannels: parseJsonMaybe(r.default_channels_json) || null,
      defaultRecipients: parseJsonMaybe(r.default_recipients_json) || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  static async findByKey(triggerKey) {
    const [rows] = await pool.execute(
      `SELECT trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json, created_at, updated_at
       FROM notification_triggers
       WHERE trigger_key = ?
       LIMIT 1`,
      [triggerKey]
    );
    const r = rows?.[0] || null;
    if (!r) return null;
    return {
      triggerKey: r.trigger_key,
      name: r.name,
      description: r.description,
      defaultEnabled: !!r.default_enabled,
      defaultChannels: parseJsonMaybe(r.default_channels_json) || null,
      defaultRecipients: parseJsonMaybe(r.default_recipients_json) || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }
}

export default NotificationTrigger;

