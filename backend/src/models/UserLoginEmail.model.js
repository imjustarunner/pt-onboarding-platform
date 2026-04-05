import pool from '../config/database.js';

class UserLoginEmail {
  static _columnSupportPromise = null;

  static async getColumnSupport() {
    if (!this._columnSupportPromise) {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      this._columnSupportPromise = pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_login_emails' AND COLUMN_NAME IN ('created_at','updated_at')",
        [dbName]
      )
        .then(([rows]) => {
          const names = new Set((rows || []).map((row) => row.COLUMN_NAME));
          return {
            hasCreatedAt: names.has('created_at'),
            hasUpdatedAt: names.has('updated_at')
          };
        })
        .catch(() => ({
          hasCreatedAt: false,
          hasUpdatedAt: false
        }));
    }
    return this._columnSupportPromise;
  }

  static normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  static async listForUser(userId) {
    const support = await this.getColumnSupport();
    const selectCols = [
      'id',
      'user_id',
      'agency_id',
      'email',
      support.hasCreatedAt ? 'created_at' : 'NULL AS created_at',
      support.hasUpdatedAt ? 'updated_at' : 'NULL AS updated_at'
    ];
    const [rows] = await pool.execute(
      `SELECT ${selectCols.join(', ')}
       FROM user_login_emails
       WHERE user_id = ?
       ORDER BY email ASC`,
      [userId]
    );
    return rows || [];
  }

  static async replaceForUser(userId, items) {
    // items: [{ email, agencyId? }]
    const cleaned = (Array.isArray(items) ? items : [])
      .map((i) => ({
        email: this.normalizeEmail(i?.email),
        agencyId: i?.agencyId === undefined || i?.agencyId === null || i?.agencyId === '' ? null : Number(i.agencyId)
      }))
      .filter((i) => i.email && i.email.includes('@'));

    // De-dupe by email
    const byEmail = new Map();
    for (const i of cleaned) byEmail.set(i.email, i);
    const unique = Array.from(byEmail.values());

    await pool.execute('DELETE FROM user_login_emails WHERE user_id = ?', [userId]);
    for (const i of unique) {
      await pool.execute(
        `INSERT INTO user_login_emails (user_id, agency_id, email) VALUES (?, ?, ?)`,
        [userId, i.agencyId, i.email]
      );
    }
    return this.listForUser(userId);
  }

  static async findUserIdByEmail(email) {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return null;
    // Use LOWER(TRIM()) for case-insensitive matching; handles legacy data with different casing/whitespace
    const [rows] = await pool.execute(
      `SELECT user_id FROM user_login_emails WHERE LOWER(TRIM(email)) = ? LIMIT 1`,
      [normalized]
    );
    return rows?.[0]?.user_id || null;
  }
}

export default UserLoginEmail;
