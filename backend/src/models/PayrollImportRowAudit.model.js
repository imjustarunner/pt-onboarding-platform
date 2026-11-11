import pool from '../config/database.js';

class PayrollImportRowAudit {
  static async listDraftReviews({ payrollImportId, agencyId }) {
    try {
      const [rows] = await pool.execute(
        `SELECT id, payroll_import_row_id, field_changed, to_value, changed_at
         FROM payroll_import_row_audit
         WHERE payroll_import_id = ? AND agency_id = ?
           AND field_changed IN ('draft_reviewed', 'draft_payable')
         ORDER BY changed_at DESC, id DESC`,
        [payrollImportId, agencyId]
      );
      return rows || [];
    } catch (error) {
      if (error?.code === 'ER_NO_SUCH_TABLE') return [];
      throw error;
    }
  }

  /** Keep the payment choice and its explicit review record together. */
  static async saveDraftDecision({ row, draftPayable, changedByUserId, expectedPeriodStatus }) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const nextValue = draftPayable ? 1 : 0;
      const [result] = await db.execute(
        `UPDATE payroll_import_rows r JOIN payroll_periods p ON p.id = r.payroll_period_id AND p.agency_id = r.agency_id
         SET r.draft_payable = ?
         WHERE r.id = ? AND r.payroll_import_id = ? AND r.payroll_period_id = ? AND r.agency_id = ? AND r.note_status = 'DRAFT'
           AND COALESCE(r.draft_payable, 0) = ? AND p.status = ?`,
        [nextValue, row.id, row.payroll_import_id, row.payroll_period_id, row.agency_id, Number(row.draft_payable || 0) ? 1 : 0, expectedPeriodStatus]
      );
      if (Number(result.affectedRows) !== 1) throw Object.assign(new Error('This draft or payroll period changed. Refresh before reviewing it again.'), { status: 409, statusCode: 409 });
      const params = [row.id, row.payroll_import_id, row.payroll_period_id, row.agency_id, 'draft_reviewed', String(Number(row.draft_payable || 0) ? 1 : 0), String(nextValue), changedByUserId];
      await db.execute(
        `INSERT INTO payroll_import_row_audit
         (payroll_import_row_id, payroll_import_id, payroll_period_id, agency_id, field_changed, from_value, to_value, changed_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, params
      );
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
  }

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
