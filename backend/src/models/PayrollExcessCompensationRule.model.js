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
    return (rows || []).map((r) => ({
      ...r,
      total_included_span: Number(r.direct_service_included_max || 0) + Number(r.admin_included_max || 0)
    }));
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
    const r = rows?.[0] || null;
    if (!r) return null;
    return {
      ...r,
      total_included_span: Number(r.direct_service_included_max || 0) + Number(r.admin_included_max || 0)
    };
  }

  static async upsert({
    agencyId,
    serviceCode,
    directServiceMinimum = 0,
    directServiceIncludedMax = 0,
    adminIncludedMax = 0,
    creditValue = 0
  }) {
    const k = codeKey(serviceCode);
    if (!k) throw new Error('serviceCode is required');

    await pool.execute(
      `INSERT INTO payroll_excess_compensation_rules
       (agency_id, service_code, direct_service_minimum, direct_service_included_max, admin_included_max, credit_value)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         direct_service_minimum = VALUES(direct_service_minimum),
         direct_service_included_max = VALUES(direct_service_included_max),
         admin_included_max = VALUES(admin_included_max),
         credit_value = VALUES(credit_value),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        k,
        Math.max(0, parseInt(directServiceMinimum ?? 0, 10)),
        Math.max(0, parseInt(directServiceIncludedMax ?? 0, 10)),
        Math.max(0, parseInt(adminIncludedMax ?? 0, 10)),
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
   * Compute excess direct and indirect minutes for a given service code entry.
   * Excess = submitted - included. Only positive excess is paid.
   */
  static computeExcessMinutes({ directMinutes, indirectMinutes, rule }) {
    if (!rule) return { excessDirect: 0, excessIndirect: 0 };
    const directIncluded = Number(rule.direct_service_included_max || 0);
    const adminIncluded = Number(rule.admin_included_max || 0);
    const direct = Math.max(0, Number(directMinutes || 0));
    const indirect = Math.max(0, Number(indirectMinutes || 0));
    return {
      excessDirect: Math.max(0, direct - directIncluded),
      excessIndirect: Math.max(0, indirect - adminIncluded)
    };
  }
}

export default PayrollExcessCompensationRule;
