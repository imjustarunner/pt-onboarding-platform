import pool from '../config/database.js';

class PayrollImportRow {
  static async bulkInsert(rows) {
    if (!rows || rows.length === 0) return 0;
    const values = [];
    for (const r of rows) {
      values.push([
        r.payrollImportId,
        r.payrollPeriodId,
        r.agencyId,
        r.userId || null,
        r.providerName,
        r.serviceCode,
        r.unitCount,
        r.rawRow ? JSON.stringify(r.rawRow) : null
      ]);
    }

    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    const [result] = await pool.execute(
      `INSERT INTO payroll_import_rows
       (payroll_import_id, payroll_period_id, agency_id, user_id, provider_name, service_code, unit_count, raw_row)
       VALUES ${placeholders}`,
      flat
    );
    return result.affectedRows || 0;
  }

  static async listForPeriod(payrollPeriodId) {
    const [rows] = await pool.execute(
      `SELECT pir.*, u.first_name, u.last_name
       FROM payroll_import_rows pir
       LEFT JOIN users u ON pir.user_id = u.id
       WHERE pir.payroll_period_id = ?
       ORDER BY pir.created_at DESC`,
      [payrollPeriodId]
    );
    return rows;
  }
}

export default PayrollImportRow;

