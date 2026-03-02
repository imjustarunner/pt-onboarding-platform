import pool from '../config/database.js';

class PayrollPeriodRunSnapshot {
  static async bulkInsert({ payrollPeriodRunId, payrollPeriodId, agencyId, rows }) {
    if (!rows || !rows.length) return 0;
    const values = [];
    for (const r of rows) {
      values.push([
        payrollPeriodRunId,
        payrollPeriodId,
        agencyId,
        r.rowMatchKey,
        r.userId ?? 0,
        r.serviceCode,
        r.serviceDate || null,
        r.noNoteUnits ?? 0,
        r.draftUnits ?? 0,
        r.finalizedUnits ?? 0,
        r.payloadCiphertextB64 || null,
        r.payloadIvB64 || null,
        r.payloadAuthTagB64 || null,
        r.payloadKeyId || null
      ]);
    }
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    const [result] = await pool.execute(
      `INSERT INTO payroll_period_run_snapshots
       (payroll_period_run_id, payroll_period_id, agency_id, row_match_key, user_id, service_code, service_date,
        no_note_units, draft_units, finalized_units, payload_ciphertext_b64, payload_iv_b64, payload_auth_tag_b64, payload_key_id)
       VALUES ${placeholders}`,
      flat
    );
    return result.affectedRows || 0;
  }

  static async listForRun(payrollPeriodRunId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_period_run_snapshots WHERE payroll_period_run_id = ?`,
      [payrollPeriodRunId]
    );
    return rows || [];
  }

  static async deleteForRun(payrollPeriodRunId) {
    const [result] = await pool.execute(
      `DELETE FROM payroll_period_run_snapshots WHERE payroll_period_run_id = ?`,
      [payrollPeriodRunId]
    );
    return result.affectedRows || 0;
  }
}

export default PayrollPeriodRunSnapshot;
