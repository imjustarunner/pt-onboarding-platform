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
}

export default PayrollImport;

