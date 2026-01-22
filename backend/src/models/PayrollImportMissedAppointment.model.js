import pool from '../config/database.js';

class PayrollImportMissedAppointment {
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

  static async replaceForImport({ payrollImportId, payrollPeriodId, agencyId, rows }) {
    // Idempotent per import: delete then insert.
    await pool.execute(
      `DELETE FROM payroll_import_missed_appointments
       WHERE payroll_import_id = ? AND payroll_period_id = ? AND agency_id = ?`,
      [payrollImportId, payrollPeriodId, agencyId]
    );

    const clean = [];
    for (const r of rows || []) {
      const clinicianName = String(r?.clinicianName || r?.clinician_name || '').trim();
      const amount = Number(r?.patientAmountPaid ?? r?.patient_amount_paid ?? 0);
      if (!clinicianName) continue;
      if (!Number.isFinite(amount)) continue;
      if (Math.abs(amount) < 1e-9) continue;
      clean.push({ clinicianName, patientAmountPaid: Number(amount.toFixed(2)) });
    }

    if (!clean.length) return 0;

    const placeholders = clean.map(() => '(?, ?, ?, ?, ?)').join(',');
    const params = [];
    for (const r of clean) {
      params.push(payrollImportId, payrollPeriodId, agencyId, r.clinicianName, r.patientAmountPaid);
    }
    const [result] = await pool.execute(
      `INSERT INTO payroll_import_missed_appointments
       (payroll_import_id, payroll_period_id, agency_id, clinician_name, patient_amount_paid)
       VALUES ${placeholders}`,
      params
    );
    return result?.affectedRows || 0;
  }

  static async listAggregatedForPeriod({ payrollPeriodId, agencyId }) {
    const latestImportId = await this._latestImportIdForPeriod(payrollPeriodId);
    if (!latestImportId) return [];
    const [rows] = await pool.execute(
      `SELECT
         clinician_name,
         COUNT(1) AS row_count,
         COALESCE(SUM(patient_amount_paid), 0) AS total_patient_amount_paid
       FROM payroll_import_missed_appointments
       WHERE payroll_period_id = ?
         AND payroll_import_id = ?
         AND agency_id = ?
       GROUP BY clinician_name
       ORDER BY clinician_name ASC`,
      [payrollPeriodId, latestImportId, agencyId]
    );
    return rows || [];
  }
}

export default PayrollImportMissedAppointment;

