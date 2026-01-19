import pool from '../config/database.js';

class PayrollPeriod {
  static async findForAgencyByDate({ agencyId, dateYmd }) {
    if (!agencyId || !dateYmd) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_periods
       WHERE agency_id = ?
         AND ? BETWEEN period_start AND period_end
       ORDER BY period_start DESC, id DESC
       LIMIT 1`,
      [agencyId, String(dateYmd).slice(0, 10)]
    );
    return rows?.[0] || null;
  }

  static async findNextForAgencyAfter({ agencyId, afterDateYmd }) {
    if (!agencyId || !afterDateYmd) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_periods
       WHERE agency_id = ?
         AND period_start > ?
       ORDER BY period_start ASC, id ASC
       LIMIT 1`,
      [agencyId, String(afterDateYmd).slice(0, 10)]
    );
    return rows?.[0] || null;
  }

  static async create({ agencyId, label, periodStart, periodEnd, createdByUserId }) {
    const [result] = await pool.execute(
      `INSERT INTO payroll_periods (agency_id, label, period_start, period_end, status, created_by_user_id)
       VALUES (?, ?, ?, ?, 'draft', ?)`,
      [agencyId, label, periodStart, periodEnd, createdByUserId]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM payroll_periods WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async findByAgencyAndDates({ agencyId, periodStart, periodEnd }) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_periods WHERE agency_id = ? AND period_start = ? AND period_end = ? LIMIT 1`,
      [agencyId, periodStart, periodEnd]
    );
    return rows[0] || null;
  }

  static async listByAgency(agencyId, { limit = 50, offset = 0 } = {}) {
    // NOTE: Some MySQL setups/drivers error on prepared placeholders in LIMIT/OFFSET.
    // Use sanitized numeric literals for LIMIT/OFFSET to avoid ER_WRONG_ARGUMENTS.
    const lim = Math.max(0, Math.min(500, parseInt(limit, 10) || 50));
    const off = Math.max(0, parseInt(offset, 10) || 0);

    const [rows] = await pool.execute(
      `SELECT
         pp.*,
         cu.first_name AS created_by_first_name,
         cu.last_name AS created_by_last_name,
         fu.first_name AS finalized_by_first_name,
         fu.last_name AS finalized_by_last_name
       FROM payroll_periods pp
       LEFT JOIN users cu ON pp.created_by_user_id = cu.id
       LEFT JOIN users fu ON pp.finalized_by_user_id = fu.id
       WHERE pp.agency_id = ?
       ORDER BY pp.period_start DESC
       LIMIT ${lim} OFFSET ${off}`,
      [agencyId]
    );
    return rows;
  }

  static async finalize(id, finalizedByUserId) {
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'finalized',
           finalized_at = CURRENT_TIMESTAMP,
           finalized_by_user_id = ?
       WHERE id = ?`,
      [finalizedByUserId, id]
    );
    return this.findById(id);
  }
}

export default PayrollPeriod;

