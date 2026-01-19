import pool from '../config/database.js';

class PayrollPtoAccount {
  static async findForAgencyUser({ agencyId, userId }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_pto_accounts
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [agencyId, userId]
    );
    return rows?.[0] || null;
  }

  static async listForAgency({ agencyId }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_pto_accounts
       WHERE agency_id = ?
       ORDER BY user_id ASC`,
      [agencyId]
    );
    return rows || [];
  }

  static async upsert({
    agencyId,
    userId,
    employmentType,
    trainingPtoEligible,
    sickStartHours,
    sickStartEffectiveDate,
    trainingStartHours,
    trainingStartEffectiveDate,
    sickBalanceHours,
    trainingBalanceHours,
    lastAccruedPayrollPeriodId,
    lastSickRolloverYear,
    trainingForfeitedAt,
    updatedByUserId
  }) {
    await pool.execute(
      `INSERT INTO payroll_pto_accounts
       (agency_id, user_id, employment_type, training_pto_eligible,
        sick_start_hours, sick_start_effective_date,
        training_start_hours, training_start_effective_date,
        sick_balance_hours, training_balance_hours,
        last_accrued_payroll_period_id, last_sick_rollover_year, training_forfeited_at,
        updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         employment_type = VALUES(employment_type),
         training_pto_eligible = VALUES(training_pto_eligible),
         sick_start_hours = VALUES(sick_start_hours),
         sick_start_effective_date = VALUES(sick_start_effective_date),
         training_start_hours = VALUES(training_start_hours),
         training_start_effective_date = VALUES(training_start_effective_date),
         sick_balance_hours = VALUES(sick_balance_hours),
         training_balance_hours = VALUES(training_balance_hours),
         last_accrued_payroll_period_id = VALUES(last_accrued_payroll_period_id),
         last_sick_rollover_year = VALUES(last_sick_rollover_year),
         training_forfeited_at = VALUES(training_forfeited_at),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        userId,
        employmentType,
        trainingPtoEligible ? 1 : 0,
        sickStartHours,
        sickStartEffectiveDate,
        trainingStartHours,
        trainingStartEffectiveDate,
        sickBalanceHours,
        trainingBalanceHours,
        lastAccruedPayrollPeriodId,
        lastSickRolloverYear,
        trainingForfeitedAt,
        updatedByUserId
      ]
    );
    return this.findForAgencyUser({ agencyId, userId });
  }
}

export default PayrollPtoAccount;

