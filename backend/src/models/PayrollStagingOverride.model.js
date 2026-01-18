import pool from '../config/database.js';

class PayrollStagingOverride {
  static async upsert({
    payrollPeriodId,
    agencyId,
    userId,
    serviceCode,
    noNoteUnits,
    draftUnits,
    finalizedUnits,
    updatedByUserId
  }) {
    await pool.execute(
      `INSERT INTO payroll_staging_overrides
       (payroll_period_id, agency_id, user_id, service_code, no_note_units, draft_units, finalized_units, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         no_note_units = VALUES(no_note_units),
         draft_units = VALUES(draft_units),
         finalized_units = VALUES(finalized_units),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        payrollPeriodId,
        agencyId,
        userId,
        serviceCode,
        noNoteUnits,
        draftUnits,
        finalizedUnits,
        updatedByUserId
      ]
    );
  }

  static async listForPeriod(payrollPeriodId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_staging_overrides WHERE payroll_period_id = ?`,
      [payrollPeriodId]
    );
    return rows;
  }
}

export default PayrollStagingOverride;

