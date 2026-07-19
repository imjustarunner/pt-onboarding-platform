import pool from '../config/database.js';

export const PRACTICE_CATEGORY_CODES = [
  'mental_health',
  'tutoring',
  'coaching',
  'consulting'
];

class UserAgencyPracticeCategory {
  static normalizeCategory(raw) {
    const t = String(raw || '').trim().toLowerCase();
    if (t === 'healthcare') return 'mental_health';
    return PRACTICE_CATEGORY_CODES.includes(t) ? t : null;
  }

  static mapRow(r) {
    if (!r) return null;
    return {
      id: Number(r.id),
      agencyId: Number(r.agency_id),
      userId: Number(r.user_id),
      category: String(r.category),
      isActive: Number(r.is_active) === 1
    };
  }

  static async listForUserAgency(agencyId, userId, { includeInactive = false } = {}) {
    const aid = Number(agencyId || 0);
    const uid = Number(userId || 0);
    if (!aid || !uid) return [];
    const [rows] = await pool.execute(
      `SELECT id, agency_id, user_id, category, is_active
       FROM user_agency_practice_categories
       WHERE agency_id = ? AND user_id = ?
         ${includeInactive ? '' : 'AND is_active = 1'}
       ORDER BY category ASC`,
      [aid, uid]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async replaceForUserAgency(agencyId, userId, categories = []) {
    const aid = Number(agencyId || 0);
    const uid = Number(userId || 0);
    if (!aid || !uid) throw new Error('Invalid agencyId or userId');

    const wanted = [];
    const seen = new Set();
    for (const raw of categories || []) {
      const code = this.normalizeCategory(raw?.category || raw?.businessType || raw);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      wanted.push(code);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE user_agency_practice_categories
         SET is_active = 0, updated_at = CURRENT_TIMESTAMP
         WHERE agency_id = ? AND user_id = ?`,
        [aid, uid]
      );
      for (const category of wanted) {
        await conn.execute(
          `INSERT INTO user_agency_practice_categories (agency_id, user_id, category, is_active)
           VALUES (?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE is_active = 1, updated_at = CURRENT_TIMESTAMP`,
          [aid, uid, category]
        );
      }
      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
    return this.listForUserAgency(aid, uid);
  }
}

export default UserAgencyPracticeCategory;
