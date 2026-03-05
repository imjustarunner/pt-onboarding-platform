import pool from '../config/database.js';

class PayrollImportRowAudit {
  static async create({
    payrollImportRowId,
    payrollImportId,
    payrollPeriodId,
    agencyId,
    fieldChanged,
    fromValue = null,
    toValue = null,
    changedByUserId
  }) {
    const [result] = await pool.execute(
      `INSERT INTO payroll_import_row_audit
       (payroll_import_row_id, payroll_import_id, payroll_period_id, agency_id, field_changed, from_value, to_value, changed_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payrollImportRowId,
        payrollImportId,
        payrollPeriodId,
        agencyId,
        fieldChanged,
        fromValue === undefined ? null : String(fromValue),
        toValue === undefined ? null : String(toValue),
        changedByUserId
      ]
    );
    return result.insertId || null;
  }
}

export default PayrollImportRowAudit;
