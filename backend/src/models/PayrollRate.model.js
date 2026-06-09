import pool from '../config/database.js';

class PayrollRate {
  static async _hasPayPercentColumn() {
    if (this.__hasPayPercentColumn !== undefined) return this.__hasPayPercentColumn;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_rates' AND COLUMN_NAME = 'pay_percent'"
      );
      this.__hasPayPercentColumn = (cols || []).length > 0;
    } catch {
      this.__hasPayPercentColumn = false;
    }
    return this.__hasPayPercentColumn;
  }

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
    payPercent = null,
    rateUnit = 'per_unit',
    effectiveStart = null,
    effectiveEnd = null
  }) {
    const pctRaw = payPercent === null || payPercent === undefined || payPercent === '' ? null : Number(payPercent);
    const pct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : null;
    const hasPayPercent = await this._hasPayPercentColumn();
    // Upsert via UNIQUE(agency_id,user_id,service_code,effective_start)
    if (hasPayPercent) {
      await pool.execute(
        `INSERT INTO payroll_rates
         (agency_id, user_id, service_code, rate_amount, pay_percent, rate_unit, effective_start, effective_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           rate_amount = VALUES(rate_amount),
           pay_percent = VALUES(pay_percent),
           rate_unit = VALUES(rate_unit),
           effective_end = VALUES(effective_end),
           updated_at = CURRENT_TIMESTAMP`,
        [agencyId, userId, serviceCode, rateAmount, pct, rateUnit, effectiveStart, effectiveEnd]
      );
    } else {
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
    }
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

