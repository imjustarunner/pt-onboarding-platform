import pool from '../config/database.js';

class PayrollServiceCodeRule {
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
    creditValue = 0,
    showInRateSheet = 1
  }) {
    await pool.execute(
      `INSERT INTO payroll_service_code_rules
       (agency_id, service_code, category, other_slot, unit_to_hour_multiplier, duration_minutes, counts_for_tier, tier_credit_multiplier, pay_divisor, credit_value, show_in_rate_sheet)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category = VALUES(category),
         other_slot = VALUES(other_slot),
         unit_to_hour_multiplier = VALUES(unit_to_hour_multiplier),
         duration_minutes = VALUES(duration_minutes),
         counts_for_tier = VALUES(counts_for_tier),
         tier_credit_multiplier = VALUES(tier_credit_multiplier),
         pay_divisor = VALUES(pay_divisor),
         credit_value = VALUES(credit_value),
         show_in_rate_sheet = VALUES(show_in_rate_sheet),
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
        Number(creditValue ?? 0),
        showInRateSheet ? 1 : 0
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

