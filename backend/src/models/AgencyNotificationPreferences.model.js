import pool from '../config/database.js';

function parseJsonMaybe(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

class AgencyNotificationPreferences {
  static async getByAgencyId(agencyId) {
    const [rows] = await pool.execute(
      `SELECT agency_id, defaults_json, user_editable, enforce_defaults, created_at, updated_at
       FROM agency_notification_preferences
       WHERE agency_id = ?
       LIMIT 1`,
      [agencyId]
    );
    const r = rows?.[0] || null;
    if (!r) return null;
    return {
      agencyId: r.agency_id,
      defaults: parseJsonMaybe(r.defaults_json) || null,
      userEditable: r.user_editable === null || r.user_editable === undefined ? true : !!r.user_editable,
      enforceDefaults: r.enforce_defaults === true || r.enforce_defaults === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  static async upsert({ agencyId, defaults = null, userEditable = true, enforceDefaults = false }) {
    await pool.execute(
      `INSERT INTO agency_notification_preferences
        (agency_id, defaults_json, user_editable, enforce_defaults)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        defaults_json = VALUES(defaults_json),
        user_editable = VALUES(user_editable),
        enforce_defaults = VALUES(enforce_defaults),
        updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        defaults ? JSON.stringify(defaults) : null,
        userEditable ? 1 : 0,
        enforceDefaults ? 1 : 0
      ]
    );
    return this.getByAgencyId(agencyId);
  }
}

export default AgencyNotificationPreferences;
