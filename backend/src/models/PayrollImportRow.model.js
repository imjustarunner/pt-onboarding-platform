import pool from '../config/database.js';

class PayrollImportRow {
  static async _latestImportIdForPeriod(payrollPeriodId) {
    const [rows] = await pool.execute(
      `SELECT id
       FROM payroll_imports
       WHERE payroll_period_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [payrollPeriodId]
    );
    return rows?.[0]?.id || null;
  }

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
        r.serviceDate || null,
        r.noteStatus || null,
        null, // appt_type (do not store)
        null, // amount_collected (do not store)
        null, // paid_status (do not store)
        r.draftPayable === undefined || r.draftPayable === null ? 1 : (r.draftPayable ? 1 : 0),
        r.unitCount,
        null, // raw_row (do not store)
        r.rowFingerprint || null
      ]);
    }

    // 15 columns inserted (see column list below) => 15 placeholders per row.
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    const [result] = await pool.execute(
      `INSERT INTO payroll_import_rows
       (payroll_import_id, payroll_period_id, agency_id, user_id, provider_name, service_code, service_date, note_status, appt_type, amount_collected, paid_status, draft_payable, unit_count, raw_row, row_fingerprint)
       VALUES ${placeholders}`,
      flat
    );
    return result.affectedRows || 0;
  }

  static async listForPeriod(payrollPeriodId) {
    const latestImportId = await this._latestImportIdForPeriod(payrollPeriodId);
    if (!latestImportId) return [];
    const [rows] = await pool.execute(
      `SELECT
         pir.id,
         pir.payroll_import_id,
         pir.payroll_period_id,
         pir.agency_id,
         pir.user_id,
         u.first_name,
         u.last_name,
         pir.provider_name,
         pir.service_code,
         pir.service_date,
         pir.note_status,
         pir.draft_payable,
         pir.unit_count,
         pir.created_at
       FROM payroll_import_rows pir
       LEFT JOIN users u ON pir.user_id = u.id
       WHERE pir.payroll_period_id = ?
         AND pir.payroll_import_id = ?
       ORDER BY pir.created_at DESC`,
      [payrollPeriodId, latestImportId]
    );
    return rows;
  }

  static async listAggregatedForPeriod(payrollPeriodId) {
    const latestImportId = await this._latestImportIdForPeriod(payrollPeriodId);
    if (!latestImportId) return [];
    const [rows] = await pool.execute(
      `SELECT
         pir.user_id,
         pir.provider_name,
         pir.service_code,
         SUM(CASE WHEN pir.note_status = 'NO_NOTE' THEN pir.unit_count ELSE 0 END) AS raw_no_note_units,
         SUM(CASE WHEN pir.note_status = 'DRAFT' AND (pir.draft_payable = 1) THEN pir.unit_count ELSE 0 END) AS raw_draft_payable_units,
         SUM(CASE WHEN pir.note_status = 'DRAFT' AND (pir.draft_payable = 0) THEN pir.unit_count ELSE 0 END) AS raw_draft_not_payable_units,
         SUM(CASE WHEN pir.note_status = 'FINALIZED' THEN pir.unit_count ELSE 0 END) AS raw_finalized_units
       FROM payroll_import_rows pir
       WHERE pir.payroll_period_id = ?
         AND pir.payroll_import_id = ?
       GROUP BY pir.user_id, pir.provider_name, pir.service_code
       ORDER BY pir.user_id ASC, pir.provider_name ASC, pir.service_code ASC`,
      [payrollPeriodId, latestImportId]
    );
    return rows;
  }

  static async updateDraftPayable({ rowId, draftPayable }) {
    const [result] = await pool.execute(
      `UPDATE payroll_import_rows
       SET draft_payable = ?
       WHERE id = ?`,
      [draftPayable ? 1 : 0, rowId]
    );
    return result.affectedRows || 0;
  }

  static async findById(rowId) {
    const [rows] = await pool.execute('SELECT * FROM payroll_import_rows WHERE id = ? LIMIT 1', [rowId]);
    return rows?.[0] || null;
  }
}

export default PayrollImportRow;

