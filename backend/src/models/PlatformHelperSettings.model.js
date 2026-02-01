import pool from '../config/database.js';

class PlatformHelperSettings {
  static async tableExists() {
    try {
      const [rows] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_helper_settings'"
      );
      return Number(rows?.[0]?.cnt || 0) > 0;
    } catch {
      return false;
    }
  }

  static async get() {
    const exists = await this.tableExists();
    if (!exists) return { enabled: true, image_path: null, missingTable: true };
    const [rows] = await pool.execute('SELECT * FROM platform_helper_settings WHERE id = 1');
    const row = rows?.[0] || null;
    if (!row) return { enabled: true, image_path: null, missingTable: false };
    return { ...row, missingTable: false };
  }

  static async update({ enabled, imagePath, actorUserId }) {
    const exists = await this.tableExists();
    if (!exists) {
      const err = new Error('Database missing platform_helper_settings table. Run database/migrations/318_create_platform_helper_settings.sql.');
      err.status = 409;
      throw err;
    }

    const enabledVal = enabled === false ? 0 : 1;
    await pool.execute(
      `INSERT INTO platform_helper_settings (id, enabled, image_path, updated_by_user_id)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         enabled = VALUES(enabled),
         image_path = VALUES(image_path),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [enabledVal, imagePath || null, actorUserId || null]
    );

    return await this.get();
  }
}

export default PlatformHelperSettings;

