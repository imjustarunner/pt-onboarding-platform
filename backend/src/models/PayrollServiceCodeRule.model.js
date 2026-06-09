import pool from '../config/database.js';

class PayrollServiceCodeRule {
  static async _hasPayRateUnitColumn() {
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_service_code_rules' AND COLUMN_NAME = 'pay_rate_unit'"
      );
      return (cols || []).length > 0;
    } catch {
      return false;
    }
  }

  static async _hasPayMethodColumns() {
    if (this.__hasPayMethodColumns !== undefined) return this.__hasPayMethodColumns;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_service_code_rules' AND COLUMN_NAME = 'pay_method'"
      );
      this.__hasPayMethodColumns = (cols || []).length > 0;
    } catch {
      this.__hasPayMethodColumns = false;
    }
    return this.__hasPayMethodColumns;
  }

  static async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_service_code_rules WHERE agency_id = ? ORDER BY service_code ASC`,
      [agencyId]
    );
    return rows;
  }

  static async upsert({
    agencyId,
    serviceCode,
    category = 'direct',
    otherSlot = 1,
    unitToHourMultiplier = 1,
    countsForTier = 1,
    durationMinutes = null,
    tierCreditMultiplier = 1,
    payDivisor = 1,
    payRateUnit = 'per_unit',
    creditValue = 0,
    showInRateSheet = 1,
    payMethod = 'fixed_rate',
    payPercent = null
  }) {
    const hasPayRateUnit = await this._hasPayRateUnitColumn();
    const hasPayMethod = await this._hasPayMethodColumns();
    const pru = String(payRateUnit || 'per_unit').trim().toLowerCase();
    const payUnit = (pru === 'per_hour') ? 'per_hour' : 'per_unit';
    const methodRaw = String(payMethod || 'fixed_rate').trim().toLowerCase();
    const method = methodRaw === 'percent_of_charge' ? 'percent_of_charge' : 'fixed_rate';
    const pctRaw = payPercent === null || payPercent === undefined || payPercent === '' ? null : Number(payPercent);
    const pct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : null;
    await pool.execute(
      `INSERT INTO payroll_service_code_rules
       (agency_id, service_code, category, other_slot, unit_to_hour_multiplier, duration_minutes, counts_for_tier, tier_credit_multiplier, pay_divisor, ${hasPayRateUnit ? 'pay_rate_unit,' : ''} credit_value, show_in_rate_sheet${hasPayMethod ? ', pay_method, pay_percent' : ''})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${hasPayRateUnit ? '?,' : ''} ?, ?${hasPayMethod ? ', ?, ?' : ''})
       ON DUPLICATE KEY UPDATE
         category = VALUES(category),
         other_slot = VALUES(other_slot),
         unit_to_hour_multiplier = VALUES(unit_to_hour_multiplier),
         duration_minutes = VALUES(duration_minutes),
         counts_for_tier = VALUES(counts_for_tier),
         tier_credit_multiplier = VALUES(tier_credit_multiplier),
         pay_divisor = VALUES(pay_divisor),
         ${hasPayRateUnit ? 'pay_rate_unit = VALUES(pay_rate_unit),' : ''}
         credit_value = VALUES(credit_value),
         show_in_rate_sheet = VALUES(show_in_rate_sheet),
         ${hasPayMethod ? 'pay_method = VALUES(pay_method), pay_percent = VALUES(pay_percent),' : ''}
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        serviceCode,
        category,
        otherSlot,
        unitToHourMultiplier,
        durationMinutes === null || durationMinutes === undefined || durationMinutes === '' ? null : parseInt(durationMinutes, 10),
        countsForTier ? 1 : 0,
        Number(tierCreditMultiplier ?? 1),
        parseInt(payDivisor ?? 1, 10),
        ...(hasPayRateUnit ? [payUnit] : []),
        Number(creditValue ?? 0),
        showInRateSheet ? 1 : 0,
        ...(hasPayMethod ? [method, pct] : [])
      ]
    );
  }

  static async delete({ agencyId, serviceCode }) {
    await pool.execute(
      `DELETE FROM payroll_service_code_rules WHERE agency_id = ? AND service_code = ?`,
      [agencyId, serviceCode]
    );
  }
}

export default PayrollServiceCodeRule;

