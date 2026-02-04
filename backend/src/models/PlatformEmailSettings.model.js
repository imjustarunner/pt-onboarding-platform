import pool from '../config/database.js';

class PlatformEmailSettings {
  static async tableExists() {
    try {
      const [rows] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_email_settings'"
      );
      return Number(rows?.[0]?.cnt || 0) > 0;
    } catch {
      return false;
    }
  }

  static async get() {
    const exists = await this.tableExists();
    if (!exists) {
      return { sending_mode: 'all', notifications_enabled: 1, missingTable: true };
    }
    const [rows] = await pool.execute('SELECT * FROM platform_email_settings WHERE id = 1');
    const row = rows?.[0] || null;
    if (!row) {
      return { sending_mode: 'all', notifications_enabled: 1, missingTable: false };
    }
    return { ...row, missingTable: false };
  }

  static async update({ sendingMode, notificationsEnabled, actorUserId }) {
    const exists = await this.tableExists();
    if (!exists) {
      const err = new Error('Database missing platform_email_settings table. Run database/migrations/348_create_email_settings_tables.sql.');
      err.status = 409;
      throw err;
    }

    const mode = String(sendingMode || 'all').trim().toLowerCase();
    const enabledVal = notificationsEnabled === false ? 0 : 1;

    await pool.execute(
      `INSERT INTO platform_email_settings (id, sending_mode, notifications_enabled, updated_by_user_id)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         sending_mode = VALUES(sending_mode),
         notifications_enabled = VALUES(notifications_enabled),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [mode, enabledVal, actorUserId || null]
    );

    return await this.get();
  }
}

export default PlatformEmailSettings;
