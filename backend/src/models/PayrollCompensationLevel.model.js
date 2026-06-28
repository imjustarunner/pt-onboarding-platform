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
         ON c.agency_id = u.agency_id
        AND c.category  = u.category
        AND c.level     = u.level
        AND u.bypass    = 0
       WHERE u.agency_id = ? AND u.user_id = ?
       LIMIT 1`,
      [agencyId, userId]
    );
    return rows[0] || null;
  },

  /**
   * bypass=true → save category (and optional level) but do NOT apply rates.
   * bypass=false → rates should be applied by the caller after this.
   * level may be null when bypass=true and no specific level chosen yet.
   */
  async assignToUser(agencyId, userId, category, level, assignedByUserId, bypass = true) {
    await pool.execute(
      `INSERT INTO payroll_user_compensation_levels
         (agency_id, user_id, category, level, bypass, assigned_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category            = VALUES(category),
         level               = VALUES(level),
         bypass              = VALUES(bypass),
         assigned_by_user_id = VALUES(assigned_by_user_id),
         updated_at          = CURRENT_TIMESTAMP`,
      [agencyId, userId, category, level ?? null, bypass ? 1 : 0, assignedByUserId || null]
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
  },

  /** Return { 1: 'Category 1', 2: 'Category 2', 3: 'Category 3' } merged with any agency overrides */
  async getCategoryLabels(agencyId) {
    const [rows] = await pool.execute(
      `SELECT category, name FROM payroll_compensation_category_labels WHERE agency_id = ?`,
      [agencyId]
    );
    const labels = { 1: '', 2: '', 3: '' };
    for (const r of rows) labels[r.category] = r.name || '';
    return labels;
  },

  async saveCategoryLabel(agencyId, category, name) {
    await pool.execute(
      `INSERT INTO payroll_compensation_category_labels (agency_id, category, name)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = CURRENT_TIMESTAMP`,
      [agencyId, category, String(name || '').trim()]
    );
  },

  /** Return all per-code rates for an agency, keyed as { "cat:level": [{serviceCode, rateAmount, rateUnit}] } */
  async getLevelRatesForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT category, level, service_code, rate_amount, rate_unit
       FROM payroll_compensation_level_rates
       WHERE agency_id = ?
       ORDER BY category, level, service_code`,
      [agencyId]
    );
    const map = {};
    for (const r of rows) {
      const key = `${r.category}:${r.level}`;
      if (!map[key]) map[key] = [];
      map[key].push({ serviceCode: r.service_code, rateAmount: Number(r.rate_amount), rateUnit: r.rate_unit });
    }
    return map;
  },

  /** Replace all per-code rates for a specific level */
  async saveLevelRates(agencyId, category, level, codeRates) {
    await pool.execute(
      `DELETE FROM payroll_compensation_level_rates WHERE agency_id = ? AND category = ? AND level = ?`,
      [agencyId, category, level]
    );
    for (const r of codeRates || []) {
      const code = String(r.serviceCode || '').trim().toUpperCase();
      if (!code) continue;
      if (r.rateAmount == null || r.rateAmount === '' || Number.isNaN(Number(r.rateAmount))) continue;
      await pool.execute(
        `INSERT INTO payroll_compensation_level_rates (agency_id, category, level, service_code, rate_amount, rate_unit)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [agencyId, category, level, code, Number(r.rateAmount || 0), r.rateUnit || 'per_unit']
      );
    }
  },

  /** Get per-code rates for a specific level */
  async getLevelRates(agencyId, category, level) {
    const [rows] = await pool.execute(
      `SELECT service_code, rate_amount, rate_unit
       FROM payroll_compensation_level_rates
       WHERE agency_id = ? AND category = ? AND level = ?
       ORDER BY service_code`,
      [agencyId, category, level]
    );
    return rows.map((r) => ({ serviceCode: r.service_code, rateAmount: Number(r.rate_amount), rateUnit: r.rate_unit }));
  }
};

export default PayrollCompensationLevel;
