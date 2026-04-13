import pool from '../config/database.js';

class PayrollImportRowAudit {
  static async listNotesForRow({ payrollImportRowId, agencyId = null }) {
    if (!payrollImportRowId) return [];
    const params = [payrollImportRowId];
    let agencyClause = '';
    if (agencyId) {
      agencyClause = 'AND a.agency_id = ?';
      params.push(agencyId);
    }
    const [rows] = await pool.execute(
      `SELECT
         a.id,
         a.payroll_import_row_id,
         a.payroll_import_id,
         a.payroll_period_id,
         a.agency_id,
         a.field_changed,
         a.from_value,
         a.to_value,
         a.changed_by_user_id,
         a.changed_at,
         u.first_name AS author_first_name,
         u.last_name AS author_last_name
       FROM payroll_import_row_audit a
       LEFT JOIN users u ON u.id = a.changed_by_user_id
       WHERE a.payroll_import_row_id = ?
         ${agencyClause}
         AND a.field_changed = 'admin_note'
       ORDER BY a.changed_at DESC, a.id DESC`,
      params
    );
    return rows || [];
  }

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
