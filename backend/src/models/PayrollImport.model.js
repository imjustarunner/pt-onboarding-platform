import pool from '../config/database.js';

class PayrollImport {
  static async create({ agencyId, payrollPeriodId, slotNumber = null, source = 'csv', originalFilename = null, uploadedByUserId }) {
    const slot = slotNumber != null ? Math.min(3, Math.max(1, Number(slotNumber) || 1)) : 1;
    const [result] = await pool.execute(
      `INSERT INTO payroll_imports (agency_id, payroll_period_id, slot_number, source, original_filename, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [agencyId, payrollPeriodId, slot, source, originalFilename, uploadedByUserId]
    );
    return this.findById(result.insertId);
  }

  static async getNextSlotForPeriod(payrollPeriodId) {
    const [all] = await pool.execute(
      `SELECT slot_number FROM payroll_imports WHERE payroll_period_id = ?`,
      [payrollPeriodId]
    );
    const used = new Set((all || []).map((r) => Number(r.slot_number || 0)));
    for (let s = 1; s <= 3; s++) {
      if (!used.has(s)) return s;
    }
    return null;
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
       ORDER BY COALESCE(pi.slot_number, 1) ASC, pi.created_at ASC, pi.id ASC`,
      [payrollPeriodId]
    );
    return rows || [];
  }

  static async deleteById(id) {
    const [result] = await pool.execute('DELETE FROM payroll_imports WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async updateFilename(id, originalFilename) {
    const [result] = await pool.execute(
      'UPDATE payroll_imports SET original_filename = ? WHERE id = ?',
      [originalFilename || null, id]
    );
    return result.affectedRows > 0;
  }
}

export default PayrollImport;

