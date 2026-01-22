import pool from '../config/database.js';

class PayrollAdjustment {
  static async _hasImatterColumns() {
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_adjustments' AND COLUMN_NAME IN ('imatter_amount','missed_appointments_amount')"
      );
      const set = new Set((cols || []).map((c) => c.COLUMN_NAME));
      return {
        hasImatter: set.has('imatter_amount'),
        hasMissed: set.has('missed_appointments_amount')
      };
    } catch {
      return { hasImatter: false, hasMissed: false };
    }
  }

  static async _hasOtherRateHoursColumns() {
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_adjustments' AND COLUMN_NAME IN ('other_rate_1_hours','other_rate_2_hours','other_rate_3_hours')"
      );
      const set = new Set((cols || []).map((c) => c.COLUMN_NAME));
      return {
        hasOther1: set.has('other_rate_1_hours'),
        hasOther2: set.has('other_rate_2_hours'),
        hasOther3: set.has('other_rate_3_hours')
      };
    } catch {
      return { hasOther1: false, hasOther2: false, hasOther3: false };
    }
  }

  static async upsert({
    payrollPeriodId,
    agencyId,
    userId,
    mileageAmount = 0,
    medcancelAmount = 0,
    otherTaxableAmount = 0,
    imatterAmount = 0,
    missedAppointmentsAmount = 0,
    bonusAmount = 0,
    reimbursementAmount = 0,
    otherRate1Hours = 0,
    otherRate2Hours = 0,
    otherRate3Hours = 0,
    salaryAmount = 0,
    ptoHours = 0,
    sickPtoHours = 0,
    trainingPtoHours = 0,
    ptoRate = 0,
    updatedByUserId
  }) {
    const { hasImatter, hasMissed } = await this._hasImatterColumns();
    const { hasOther1, hasOther2, hasOther3 } = await this._hasOtherRateHoursColumns();
    const fields = [
      'payroll_period_id',
      'agency_id',
      'user_id',
      'mileage_amount',
      'medcancel_amount',
      'other_taxable_amount',
      ...(hasImatter ? ['imatter_amount'] : []),
      ...(hasMissed ? ['missed_appointments_amount'] : []),
      'bonus_amount',
      'reimbursement_amount',
      ...(hasOther1 ? ['other_rate_1_hours'] : []),
      ...(hasOther2 ? ['other_rate_2_hours'] : []),
      ...(hasOther3 ? ['other_rate_3_hours'] : []),
      'salary_amount',
      'pto_hours',
      'sick_pto_hours',
      'training_pto_hours',
      'pto_rate',
      'updated_by_user_id'
    ];
    const placeholders = fields.map(() => '?').join(', ');
    const updates = [
      'mileage_amount = VALUES(mileage_amount)',
      'medcancel_amount = VALUES(medcancel_amount)',
      'other_taxable_amount = VALUES(other_taxable_amount)',
      ...(hasImatter ? ['imatter_amount = VALUES(imatter_amount)'] : []),
      ...(hasMissed ? ['missed_appointments_amount = VALUES(missed_appointments_amount)'] : []),
      'bonus_amount = VALUES(bonus_amount)',
      'reimbursement_amount = VALUES(reimbursement_amount)',
      ...(hasOther1 ? ['other_rate_1_hours = VALUES(other_rate_1_hours)'] : []),
      ...(hasOther2 ? ['other_rate_2_hours = VALUES(other_rate_2_hours)'] : []),
      ...(hasOther3 ? ['other_rate_3_hours = VALUES(other_rate_3_hours)'] : []),
      'salary_amount = VALUES(salary_amount)',
      'pto_hours = VALUES(pto_hours)',
      'sick_pto_hours = VALUES(sick_pto_hours)',
      'training_pto_hours = VALUES(training_pto_hours)',
      'pto_rate = VALUES(pto_rate)',
      'updated_by_user_id = VALUES(updated_by_user_id)',
      'updated_at = CURRENT_TIMESTAMP'
    ].join(',\n         ');
    const values = [
      payrollPeriodId,
      agencyId,
      userId,
      mileageAmount,
      medcancelAmount,
      otherTaxableAmount,
      ...(hasImatter ? [imatterAmount] : []),
      ...(hasMissed ? [missedAppointmentsAmount] : []),
      bonusAmount,
      reimbursementAmount,
      ...(hasOther1 ? [otherRate1Hours] : []),
      ...(hasOther2 ? [otherRate2Hours] : []),
      ...(hasOther3 ? [otherRate3Hours] : []),
      salaryAmount,
      ptoHours,
      sickPtoHours,
      trainingPtoHours,
      ptoRate,
      updatedByUserId
    ];

    await pool.execute(
      `INSERT INTO payroll_adjustments
       (${fields.join(', ')})
       VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE
         ${updates}`,
      values
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

