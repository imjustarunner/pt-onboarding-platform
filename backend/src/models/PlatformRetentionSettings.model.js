import pool from '../config/database.js';

class PlatformRetentionSettings {
  static async tableExists() {
    try {
      const [rows] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_retention_settings'"
      );
      return Number(rows?.[0]?.cnt || 0) > 0;
    } catch {
      return false;
    }
  }

  static normalize(row) {
    if (!row) {
      return {
        default_intake_retention_mode: 'days',
        default_intake_retention_days: 14,
        missingTable: true
      };
    }
    return {
      ...row,
      missingTable: false
    };
  }

  static async get() {
    const exists = await this.tableExists();
    if (!exists) return this.normalize(null);
    const [rows] = await pool.execute('SELECT * FROM platform_retention_settings WHERE id = 1');
    const row = rows?.[0] || null;
    return this.normalize(row);
  }

  static async upsert({ defaultIntakeRetentionMode, defaultIntakeRetentionDays, actorUserId }) {
    const exists = await this.tableExists();
    if (!exists) {
      const err = new Error('Database missing platform_retention_settings table. Run database/migrations/362_intake_retention_policies.sql.');
      err.status = 409;
      throw err;
    }

    const mode = ['days', 'never'].includes(String(defaultIntakeRetentionMode || '').toLowerCase())
      ? String(defaultIntakeRetentionMode).toLowerCase()
      : 'days';
    const days = Number.isFinite(Number(defaultIntakeRetentionDays))
      ? Math.max(1, Math.min(3650, Number(defaultIntakeRetentionDays)))
      : 14;

    await pool.execute(
      `INSERT INTO platform_retention_settings (id, default_intake_retention_mode, default_intake_retention_days, updated_by_user_id)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         default_intake_retention_mode = VALUES(default_intake_retention_mode),
         default_intake_retention_days = VALUES(default_intake_retention_days),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [mode, days, actorUserId || null]
    );
    return this.get();
  }
}

export default PlatformRetentionSettings;
