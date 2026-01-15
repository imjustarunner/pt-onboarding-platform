import pool from '../config/database.js';

class PayrollPeriod {
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

  static async listByAgency(agencyId, { limit = 50, offset = 0 } = {}) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_periods
       WHERE agency_id = ?
       ORDER BY period_start DESC
       LIMIT ? OFFSET ?`,
      [agencyId, limit, offset]
    );
    return rows;
  }
}

export default PayrollPeriod;

