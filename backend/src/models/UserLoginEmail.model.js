import pool from '../config/database.js';

class UserLoginEmail {
  static normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  static async listForUser(userId) {
    const [rows] = await pool.execute(
      `SELECT id, user_id, agency_id, email, created_at, updated_at
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

