import pool from '../config/database.js';

class AgencyEmailSettings {
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
      return { agency_id: agencyId, notifications_enabled: 1, missingTable: false };
    }
    return { ...row, missingTable: false };
  }

  static async listByAgencyIds(agencyIds = []) {
    const exists = await this.tableExists();
    if (!exists) {
      return (agencyIds || []).map((id) => ({ agency_id: id, notifications_enabled: 1, missingTable: true }));
    }
    if (!agencyIds || !agencyIds.length) return [];
    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT * FROM agency_email_settings WHERE agency_id IN (${placeholders})`,
      agencyIds
    );
    return rows || [];
  }

  static async update({ agencyId, notificationsEnabled, actorUserId }) {
    const exists = await this.tableExists();
    if (!exists) {
      const err = new Error('Database missing agency_email_settings table. Run database/migrations/348_create_email_settings_tables.sql.');
      err.status = 409;
      throw err;
    }
    const enabledVal = notificationsEnabled === false ? 0 : 1;
    await pool.execute(
      `INSERT INTO agency_email_settings (agency_id, notifications_enabled, updated_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         notifications_enabled = VALUES(notifications_enabled),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, enabledVal, actorUserId || null]
    );
    return await this.getByAgencyId(agencyId);
  }
}

export default AgencyEmailSettings;
