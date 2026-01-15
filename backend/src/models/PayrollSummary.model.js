import pool from '../config/database.js';

class PayrollSummary {
  static async upsert({
    payrollPeriodId,
    agencyId,
    userId,
    totalUnits,
    subtotalAmount,
    adjustmentsAmount = 0,
    totalAmount,
    breakdown
  }) {
    await pool.execute(
      `INSERT INTO payroll_summaries
       (payroll_period_id, agency_id, user_id, total_units, subtotal_amount, adjustments_amount, total_amount, breakdown)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_units = VALUES(total_units),
         subtotal_amount = VALUES(subtotal_amount),
         adjustments_amount = VALUES(adjustments_amount),
         total_amount = VALUES(total_amount),
         breakdown = VALUES(breakdown),
         computed_at = CURRENT_TIMESTAMP`,
      [
        payrollPeriodId,
        agencyId,
        userId,
        totalUnits,
        subtotalAmount,
        adjustmentsAmount,
        totalAmount,
        breakdown ? JSON.stringify(breakdown) : null
      ]
    );
  }

  static async listForPeriod(payrollPeriodId) {
    const [rows] = await pool.execute(
      `SELECT ps.*, u.first_name, u.last_name, u.email
       FROM payroll_summaries ps
       JOIN users u ON ps.user_id = u.id
       WHERE ps.payroll_period_id = ?
       ORDER BY ps.total_amount DESC`,
      [payrollPeriodId]
    );
    return rows.map((r) => {
      if (typeof r.breakdown === 'string') {
        try { r.breakdown = JSON.parse(r.breakdown); } catch { /* ignore */ }
      }
      return r;
    });
  }

  static async listForUser({ userId, agencyId = null, limit = 50, offset = 0 }) {
    const params = [userId];
    let where = 'ps.user_id = ?';
    if (agencyId) {
      where += ' AND ps.agency_id = ?';
      params.push(agencyId);
    }
    params.push(limit, offset);
    const [rows] = await pool.execute(
      `SELECT ps.*, pp.label, pp.period_start, pp.period_end, pp.status
       FROM payroll_summaries ps
       JOIN payroll_periods pp ON ps.payroll_period_id = pp.id
       WHERE ${where}
       ORDER BY pp.period_start DESC
       LIMIT ? OFFSET ?`,
      params
    );
    return rows.map((r) => {
      if (typeof r.breakdown === 'string') {
        try { r.breakdown = JSON.parse(r.breakdown); } catch { /* ignore */ }
      }
      return r;
    });
  }
}

export default PayrollSummary;

