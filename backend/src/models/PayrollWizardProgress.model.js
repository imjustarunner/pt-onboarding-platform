import pool from '../config/database.js';

class PayrollWizardProgress {
  static async get({ agencyId, userId, payrollPeriodId }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_wizard_progress
       WHERE agency_id = ? AND user_id = ? AND payroll_period_id = ?
       LIMIT 1`,
      [agencyId, userId, payrollPeriodId]
    );
    return rows?.[0] || null;
  }

  static async upsert({ agencyId, userId, payrollPeriodId, state }) {
    const json = JSON.stringify(state ?? {});
    await pool.execute(
      `INSERT INTO payroll_wizard_progress
       (agency_id, user_id, payroll_period_id, state_json)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         state_json = VALUES(state_json),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, userId, payrollPeriodId, json]
    );
    return this.get({ agencyId, userId, payrollPeriodId });
  }
}

export default PayrollWizardProgress;

