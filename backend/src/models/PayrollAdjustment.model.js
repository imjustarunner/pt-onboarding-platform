import pool from '../config/database.js';

class PayrollAdjustment {
  static async upsert({
    payrollPeriodId,
    agencyId,
    userId,
    mileageAmount = 0,
    medcancelAmount = 0,
    otherTaxableAmount = 0,
    bonusAmount = 0,
    reimbursementAmount = 0,
    salaryAmount = 0,
    ptoHours = 0,
    ptoRate = 0,
    updatedByUserId
  }) {
    await pool.execute(
      `INSERT INTO payroll_adjustments
       (payroll_period_id, agency_id, user_id, mileage_amount, medcancel_amount, other_taxable_amount, bonus_amount, reimbursement_amount, salary_amount, pto_hours, pto_rate, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         mileage_amount = VALUES(mileage_amount),
         medcancel_amount = VALUES(medcancel_amount),
         other_taxable_amount = VALUES(other_taxable_amount),
         bonus_amount = VALUES(bonus_amount),
         reimbursement_amount = VALUES(reimbursement_amount),
         salary_amount = VALUES(salary_amount),
         pto_hours = VALUES(pto_hours),
         pto_rate = VALUES(pto_rate),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        payrollPeriodId,
        agencyId,
        userId,
        mileageAmount,
        medcancelAmount,
        otherTaxableAmount,
        bonusAmount,
        reimbursementAmount,
        salaryAmount,
        ptoHours,
        ptoRate,
        updatedByUserId
      ]
    );
  }

  static async findForPeriodUser(payrollPeriodId, userId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_adjustments WHERE payroll_period_id = ? AND user_id = ? LIMIT 1`,
      [payrollPeriodId, userId]
    );
    return rows?.[0] || null;
  }
}

export default PayrollAdjustment;

