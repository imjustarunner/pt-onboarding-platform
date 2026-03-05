import pool from '../config/database.js';

class PayrollImport {
  static async create({ agencyId, payrollPeriodId, source = 'csv', originalFilename = null, uploadedByUserId }) {
    const [result] = await pool.execute(
      `INSERT INTO payroll_imports (agency_id, payroll_period_id, source, original_filename, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, payrollPeriodId, source, originalFilename, uploadedByUserId]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM payroll_imports WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async listForPeriod(payrollPeriodId) {
    const [rows] = await pool.execute(
      `SELECT
         pi.*,
         u.first_name AS uploaded_by_first_name,
         u.last_name AS uploaded_by_last_name
       FROM payroll_imports pi
       LEFT JOIN users u ON u.id = pi.uploaded_by_user_id
       WHERE pi.payroll_period_id = ?
       ORDER BY pi.created_at ASC, pi.id ASC`,
      [payrollPeriodId]
    );
    return rows || [];
  }
}

export default PayrollImport;

