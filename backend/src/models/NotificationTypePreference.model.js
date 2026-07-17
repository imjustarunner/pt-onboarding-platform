import pool from '../config/database.js';

const BOOL_FIELDS = {
  inApp: 'in_app_enabled',
  toast: 'toast_enabled',
  sound: 'sound_enabled',
  push: 'push_enabled',
  email: 'email_enabled',
  sms: 'sms_enabled',
  digest: 'digest_enabled'
};

function asNullableBoolean(value) {
  if (value === null || value === undefined) return null;
  return value === true || value === 1 || value === '1';
}

function fromRow(row) {
  if (!row) return null;
  return {
    userId: Number(row.user_id),
    type: row.notification_type,
    inApp: row.in_app_enabled == null ? null : !!row.in_app_enabled,
    toast: row.toast_enabled == null ? null : !!row.toast_enabled,
    sound: row.sound_enabled == null ? null : !!row.sound_enabled,
    push: row.push_enabled == null ? null : !!row.push_enabled,
    email: row.email_enabled == null ? null : !!row.email_enabled,
    sms: row.sms_enabled == null ? null : !!row.sms_enabled,
    digest: row.digest_enabled == null ? null : !!row.digest_enabled,
    toastDurationMode: row.toast_duration_mode || null,
    toastDurationSeconds: row.toast_duration_seconds == null ? null : Number(row.toast_duration_seconds),
    updatedAt: row.updated_at
  };
}

class NotificationTypePreference {
  static async listForUser(userId) {
    const [rows] = await pool.execute(
      `SELECT * FROM user_notification_type_preferences WHERE user_id = ? ORDER BY notification_type`,
      [Number(userId)]
    );
    return (rows || []).map(fromRow);
  }

  static async get(userId, type) {
    const [rows] = await pool.execute(
      `SELECT * FROM user_notification_type_preferences WHERE user_id = ? AND notification_type = ? LIMIT 1`,
      [Number(userId), String(type)]
    );
    return fromRow(rows?.[0]);
  }

  static async upsert(userId, type, updates = {}) {
    const current = await this.get(userId, type);
    const merged = { ...(current || {}), ...updates };
    const values = Object.keys(BOOL_FIELDS).map((key) => {
      const value = asNullableBoolean(merged[key]);
      return value == null ? null : (value ? 1 : 0);
    });
    const mode = merged.toastDurationMode == null ? null : String(merged.toastDurationMode);
    const seconds = merged.toastDurationSeconds == null ? null : Number(merged.toastDurationSeconds);
    await pool.execute(
      `INSERT INTO user_notification_type_preferences
        (user_id, notification_type, in_app_enabled, toast_enabled, sound_enabled,
         push_enabled, email_enabled, sms_enabled, digest_enabled,
         toast_duration_mode, toast_duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         in_app_enabled = VALUES(in_app_enabled), toast_enabled = VALUES(toast_enabled),
         sound_enabled = VALUES(sound_enabled), push_enabled = VALUES(push_enabled),
         email_enabled = VALUES(email_enabled), sms_enabled = VALUES(sms_enabled),
         digest_enabled = VALUES(digest_enabled),
         toast_duration_mode = VALUES(toast_duration_mode),
         toast_duration_seconds = VALUES(toast_duration_seconds),
         updated_at = CURRENT_TIMESTAMP`,
      [Number(userId), String(type), ...values, mode, seconds]
    );
    return this.get(userId, type);
  }

  static async reset(userId, type) {
    await pool.execute(
      `DELETE FROM user_notification_type_preferences WHERE user_id = ? AND notification_type = ?`,
      [Number(userId), String(type)]
    );
  }
}

export default NotificationTypePreference;
