import pool from '../config/database.js';

class PayrollPeriodRun {
  static async create({ payrollPeriodId, agencyId, payrollImportId = null, ranByUserId }) {
    const [result] = await pool.execute(
      `INSERT INTO payroll_period_runs (payroll_period_id, agency_id, payroll_import_id, ran_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [payrollPeriodId, agencyId, payrollImportId, ranByUserId]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM payroll_period_runs WHERE id = ?', [id]);
    return rows?.[0] || null;
  }

  static async listForPeriod(payrollPeriodId) {
    const [rows] = await pool.execute(
      `SELECT r.*, u.first_name AS ran_by_first_name, u.last_name AS ran_by_last_name
       FROM payroll_period_runs r
       LEFT JOIN users u ON r.ran_by_user_id = u.id
       WHERE r.payroll_period_id = ?
       ORDER BY r.ran_at ASC, r.id ASC`,
      [payrollPeriodId]
    );
    return rows || [];
  }
}

export default PayrollPeriodRun;

