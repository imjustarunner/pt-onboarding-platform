import pool from '../config/database.js';

class PayrollPeriodRunRow {
  static async bulkInsert({ payrollPeriodRunId, payrollPeriodId, agencyId, rows }) {
    if (!rows || !rows.length) return 0;
    const values = [];
    for (const r of rows) {
      values.push([
        payrollPeriodRunId,
        payrollPeriodId,
        agencyId,
        r.userId,
        r.serviceCode,
        r.noNoteUnits,
        r.draftUnits,
        r.finalizedUnits
      ]);
    }
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    const [result] = await pool.execute(
      `INSERT INTO payroll_period_run_rows
       (payroll_period_run_id, payroll_period_id, agency_id, user_id, service_code, no_note_units, draft_units, finalized_units)
       VALUES ${placeholders}`,
      flat
    );
    return result.affectedRows || 0;
  }

  static async listForRun(payrollPeriodRunId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_period_run_rows WHERE payroll_period_run_id = ?`,
      [payrollPeriodRunId]
    );
    return rows || [];
  }
}

export default PayrollPeriodRunRow;

