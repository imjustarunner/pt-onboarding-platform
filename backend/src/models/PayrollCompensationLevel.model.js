import pool from '../config/database.js';

export const COMPENSATION_CATEGORIES = Object.freeze({
  1: { label: 'Category 1', description: 'Bachelors, Interns, QBHA & Peer Professionals' },
  2: { label: 'Category 2', description: 'Pre-licensed & Unlicensed Masters Level' },
  3: { label: 'Category 3', description: 'Licensed Professionals' }
});

export const CATEGORY_IDS = [1, 2, 3];
export const LEVEL_IDS = [1, 2, 3, 4, 5];

const PayrollCompensationLevel = {
  /** Return all 15 level rows for an agency, filling in nulls for unconfigured slots */
  async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_compensation_levels WHERE agency_id = ? ORDER BY category, level`,
      [agencyId]
    );
    const byKey = new Map(rows.map((r) => [`${r.category}:${r.level}`, r]));
    const result = [];
    for (const cat of CATEGORY_IDS) {
      for (const lvl of LEVEL_IDS) {
        const existing = byKey.get(`${cat}:${lvl}`);
        result.push(existing || {
          id: null,
          agency_id: agencyId,
          category: cat,
          level: lvl,
          label: null,
          direct_rate: null,
          indirect_rate: null,
          ffs_rate: null,
          has_ffs: 0
        });
      }
    }
    return result;
  },

  async upsert(agencyId, category, level, { label, directRate, indirectRate, ffsRate, hasFfs }) {
    await pool.execute(
      `INSERT INTO payroll_compensation_levels
         (agency_id, category, level, label, direct_rate, indirect_rate, ffs_rate, has_ffs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         label         = VALUES(label),
         direct_rate   = VALUES(direct_rate),
         indirect_rate = VALUES(indirect_rate),
         ffs_rate      = VALUES(ffs_rate),
         has_ffs       = VALUES(has_ffs),
         updated_at    = CURRENT_TIMESTAMP`,
      [
        agencyId, category, level,
        label || null,
        directRate != null ? Number(directRate) : null,
        indirectRate != null ? Number(indirectRate) : null,
        ffsRate != null ? Number(ffsRate) : null,
        hasFfs ? 1 : 0
      ]
    );
  },

  async getForUser(agencyId, userId) {
    const [rows] = await pool.execute(
      `SELECT u.*, c.label, c.direct_rate, c.indirect_rate, c.ffs_rate, c.has_ffs
       FROM payroll_user_compensation_levels u
       LEFT JOIN payroll_compensation_levels c
         ON c.agency_id = u.agency_id AND c.category = u.category AND c.level = u.level
       WHERE u.agency_id = ? AND u.user_id = ?
       LIMIT 1`,
      [agencyId, userId]
    );
    return rows[0] || null;
  },

  async assignToUser(agencyId, userId, category, level, assignedByUserId) {
    await pool.execute(
      `INSERT INTO payroll_user_compensation_levels
         (agency_id, user_id, category, level, assigned_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category            = VALUES(category),
         level               = VALUES(level),
         assigned_by_user_id = VALUES(assigned_by_user_id),
         updated_at          = CURRENT_TIMESTAMP`,
      [agencyId, userId, category, level, assignedByUserId || null]
    );
  },

  async removeFromUser(agencyId, userId) {
    await pool.execute(
      `DELETE FROM payroll_user_compensation_levels WHERE agency_id = ? AND user_id = ?`,
      [agencyId, userId]
    );
  },

  async getLevel(agencyId, category, level) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_compensation_levels WHERE agency_id = ? AND category = ? AND level = ? LIMIT 1`,
      [agencyId, category, level]
    );
    return rows[0] || null;
  }
};

export default PayrollCompensationLevel;
