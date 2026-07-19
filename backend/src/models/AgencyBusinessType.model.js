import pool from '../config/database.js';

/** Catalog shown in admin pickers (healthcare consolidated into mental_health). */
export const BUSINESS_TYPE_CODES = [
  'mental_health',
  'learning',
  'tutoring',
  'coaching',
  'consulting',
  'mentorship',
  'skills_development',
  'other'
];

/** Legacy aliases still accepted on read/write and remapped. */
export const BUSINESS_TYPE_ALIASES = {
  healthcare: 'mental_health'
};

class AgencyBusinessType {
  static normalizeType(raw) {
    const t = String(raw || '').trim().toLowerCase();
    if (!t) return null;
    const aliased = BUSINESS_TYPE_ALIASES[t] || t;
    return BUSINESS_TYPE_CODES.includes(aliased) ? aliased : null;
  }

  static async listForAgency(agencyId) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const [rows] = await pool.execute(
      `SELECT id, agency_id, business_type, is_enabled, sort_order, created_at, updated_at
       FROM agency_business_types
       WHERE agency_id = ?
       ORDER BY sort_order ASC, business_type ASC`,
      [aid]
    );
    return (rows || []).map((r) => ({
      id: Number(r.id),
      agencyId: Number(r.agency_id),
      businessType: String(r.business_type),
      isEnabled: Number(r.is_enabled) === 1,
      sortOrder: Number(r.sort_order || 0)
    }));
  }

  static async setForAgency(agencyId, types = []) {
    const aid = Number(agencyId || 0);
    if (!aid) throw new Error('Invalid agencyId');
    const normalized = [];
    const seen = new Set();
    for (const row of types || []) {
      const code = this.normalizeType(row?.businessType || row?.business_type || row);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      normalized.push({
        businessType: code,
        isEnabled: row?.isEnabled !== false && row?.is_enabled !== 0 && row?.is_enabled !== false,
        sortOrder: Number(row?.sortOrder ?? row?.sort_order ?? normalized.length) || 0
      });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`DELETE FROM agency_business_types WHERE agency_id = ?`, [aid]);
      for (const row of normalized) {
        await conn.execute(
          `INSERT INTO agency_business_types (agency_id, business_type, is_enabled, sort_order)
           VALUES (?, ?, ?, ?)`,
          [aid, row.businessType, row.isEnabled ? 1 : 0, row.sortOrder]
        );
      }
      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
    return this.listForAgency(aid);
  }
}

export default AgencyBusinessType;
