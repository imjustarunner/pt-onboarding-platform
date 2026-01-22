import pool from '../config/database.js';

class PayrollSalaryPosition {
  static async listForUser({ agencyId, userId }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_salary_positions
       WHERE agency_id = ? AND user_id = ?
       ORDER BY effective_start DESC, id DESC`,
      [agencyId, userId]
    );
    return rows || [];
  }

  static async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_salary_positions WHERE agency_id = ? ORDER BY user_id ASC, effective_start DESC, id DESC`,
      [agencyId]
    );
    return rows || [];
  }

  static async findActiveForUser({ agencyId, userId, asOfDate }) {
    const asOf = asOfDate ? String(asOfDate).slice(0, 10) : null;
    if (!agencyId || !userId || !asOf) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_salary_positions
       WHERE agency_id = ?
         AND user_id = ?
         AND (effective_start IS NULL OR effective_start <= ?)
         AND (effective_end IS NULL OR effective_end >= ?)
       ORDER BY effective_start DESC, id DESC
       LIMIT 1`,
      [agencyId, userId, asOf, asOf]
    );
    return rows?.[0] || null;
  }

  static async upsert({
    id = null,
    agencyId,
    userId,
    salaryPerPayPeriod,
    includeServicePay = 0,
    prorateByDays = 1,
    effectiveStart = null,
    effectiveEnd = null,
    updatedByUserId,
    createdByUserId
  }) {
    const salary = Number(salaryPerPayPeriod || 0);
    if (!Number.isFinite(salary) || salary < 0) throw new Error('salaryPerPayPeriod must be a non-negative number');

    if (id) {
      await pool.execute(
        `UPDATE payroll_salary_positions
         SET salary_per_pay_period = ?,
             include_service_pay = ?,
             prorate_by_days = ?,
             effective_start = ?,
             effective_end = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND agency_id = ? AND user_id = ?`,
        [
          salary,
          includeServicePay ? 1 : 0,
          prorateByDays ? 1 : 0,
          effectiveStart || null,
          effectiveEnd || null,
          updatedByUserId || null,
          id,
          agencyId,
          userId
        ]
      );
      const [rows] = await pool.execute(`SELECT * FROM payroll_salary_positions WHERE id = ? LIMIT 1`, [id]);
      return rows?.[0] || null;
    }

    const [result] = await pool.execute(
      `INSERT INTO payroll_salary_positions
       (agency_id, user_id, salary_per_pay_period, include_service_pay, prorate_by_days, effective_start, effective_end, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        userId,
        salary,
        includeServicePay ? 1 : 0,
        prorateByDays ? 1 : 0,
        effectiveStart || null,
        effectiveEnd || null,
        createdByUserId,
        updatedByUserId || null
      ]
    );
    const newId = result.insertId;
    const [rows] = await pool.execute(`SELECT * FROM payroll_salary_positions WHERE id = ? LIMIT 1`, [newId]);
    return rows?.[0] || null;
  }

  static async delete({ id, agencyId }) {
    await pool.execute(`DELETE FROM payroll_salary_positions WHERE id = ? AND agency_id = ?`, [id, agencyId]);
  }
}

export default PayrollSalaryPosition;

