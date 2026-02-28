import pool from '../config/database.js';

function codeKey(v) {
  return String(v || '').trim().toUpperCase();
}

class PayrollExcessCompensationRule {
  static async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_excess_compensation_rules
       WHERE agency_id = ?
       ORDER BY service_code ASC`,
      [agencyId]
    );
    return rows || [];
  }

  static async findByAgencyAndCode(agencyId, serviceCode) {
    const k = codeKey(serviceCode);
    if (!k) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_excess_compensation_rules
       WHERE agency_id = ? AND service_code = ?
       LIMIT 1`,
      [agencyId, k]
    );
    return rows?.[0] || null;
  }

  static async upsert({
    agencyId,
    serviceCode,
    expectedDirectTotal = 0,
    expectedIndirectTotal = 0,
    creditValue = 0
  }) {
    const k = codeKey(serviceCode);
    if (!k) throw new Error('serviceCode is required');

    await pool.execute(
      `INSERT INTO payroll_excess_compensation_rules
       (agency_id, service_code, expected_direct_total, expected_indirect_total, credit_value)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         expected_direct_total = VALUES(expected_direct_total),
         expected_indirect_total = VALUES(expected_indirect_total),
         credit_value = VALUES(credit_value),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        k,
        Math.max(0, parseInt(expectedDirectTotal ?? 0, 10)),
        Math.max(0, parseInt(expectedIndirectTotal ?? 0, 10)),
        Number(creditValue ?? 0)
      ]
    );
    return this.findByAgencyAndCode(agencyId, k);
  }

  static async delete({ agencyId, serviceCode }) {
    const k = codeKey(serviceCode);
    if (!k) return;
    await pool.execute(
      `DELETE FROM payroll_excess_compensation_rules
       WHERE agency_id = ? AND service_code = ?`,
      [agencyId, k]
    );
  }

  /**
   * Compute excess direct and indirect minutes for a pay period.
   * Excess = actual - expected. Only positive excess is paid.
   * If units is provided, expected = units * table value (per-unit expected).
   */
  static computeExcessMinutes({ actualDirectMinutes, actualIndirectMinutes, rule, units = 1 }) {
    if (!rule) return { excessDirect: 0, excessIndirect: 0 };
    const u = Math.max(1, Number(units || 1));
    const expectedDirect = u * Number(rule.expected_direct_total || 0);
    const expectedIndirect = u * Number(rule.expected_indirect_total || 0);
    const actualDirect = Math.max(0, Number(actualDirectMinutes || 0));
    const actualIndirect = Math.max(0, Number(actualIndirectMinutes || 0));
    return {
      excessDirect: Math.max(0, actualDirect - expectedDirect),
      excessIndirect: Math.max(0, actualIndirect - expectedIndirect)
    };
  }
}

export default PayrollExcessCompensationRule;
