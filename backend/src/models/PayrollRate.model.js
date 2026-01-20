import pool from '../config/database.js';

class PayrollRate {
  static async deleteAllForUser(agencyId, userId) {
    await pool.execute(
      `DELETE FROM payroll_rates WHERE agency_id = ? AND user_id = ?`,
      [agencyId, userId]
    );
  }

  static async deleteForUserCode({ agencyId, userId, serviceCode }) {
    const aId = agencyId ? parseInt(agencyId, 10) : null;
    const uId = userId ? parseInt(userId, 10) : null;
    const code = String(serviceCode || '').trim();
    if (!aId || !uId || !code) return 0;
    const [result] = await pool.execute(
      `DELETE FROM payroll_rates
       WHERE agency_id = ? AND user_id = ? AND service_code = ?`,
      [aId, uId, code]
    );
    return result.affectedRows || 0;
  }

  static async upsert({
    agencyId,
    userId,
    serviceCode,
    rateAmount,
    rateUnit = 'per_unit',
    effectiveStart = null,
    effectiveEnd = null
  }) {
    // Upsert via UNIQUE(agency_id,user_id,service_code,effective_start)
    await pool.execute(
      `INSERT INTO payroll_rates
       (agency_id, user_id, service_code, rate_amount, rate_unit, effective_start, effective_end)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         rate_amount = VALUES(rate_amount),
         rate_unit = VALUES(rate_unit),
         effective_end = VALUES(effective_end),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, userId, serviceCode, rateAmount, rateUnit, effectiveStart, effectiveEnd]
    );
    return this.findBestRate({ agencyId, userId, serviceCode, asOf: effectiveStart || null });
  }

  static async listForUser(agencyId, userId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_rates
       WHERE agency_id = ? AND user_id = ?
       ORDER BY service_code ASC, effective_start DESC`,
      [agencyId, userId]
    );
    return rows;
  }

  static async findBestRate({ agencyId, userId, serviceCode, asOf = null }) {
    // Pick the most recent rate effective at asOf (or latest).
    const params = [agencyId, userId, serviceCode];
    let where = 'agency_id = ? AND user_id = ? AND service_code = ?';
    if (asOf) {
      where += ' AND (effective_start IS NULL OR effective_start <= ?)';
      params.push(asOf);
      where += ' AND (effective_end IS NULL OR effective_end >= ?)';
      params.push(asOf);
    }
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_rates
       WHERE ${where}
       ORDER BY (effective_start IS NULL) ASC, effective_start DESC
       LIMIT 1`,
      params
    );
    return rows[0] || null;
  }
}

export default PayrollRate;

