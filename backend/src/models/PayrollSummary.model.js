import pool from '../config/database.js';

class PayrollSummary {
  static async upsert({
    payrollPeriodId,
    agencyId,
    userId,
    noNoteUnits = 0,
    draftUnits = 0,
    finalizedUnits = 0,
    tierCreditsCurrent = 0,
    tierCreditsPrior = 0,
    tierCreditsFinal = 0,
    graceActive = 0,
    totalHours = 0,
    directHours = 0,
    indirectHours = 0,
    totalUnits,
    subtotalAmount,
    adjustmentsAmount = 0,
    totalAmount,
    breakdown
  }) {
    await pool.execute(
      `INSERT INTO payroll_summaries
       (payroll_period_id, agency_id, user_id,
        no_note_units, draft_units, finalized_units,
        tier_credits_current, tier_credits_prior, tier_credits_final, grace_active,
        total_hours, direct_hours, indirect_hours,
        total_units, subtotal_amount, adjustments_amount, total_amount, breakdown)
       VALUES (?, ?, ?,
               ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         no_note_units = VALUES(no_note_units),
         draft_units = VALUES(draft_units),
         finalized_units = VALUES(finalized_units),
         tier_credits_current = VALUES(tier_credits_current),
         tier_credits_prior = VALUES(tier_credits_prior),
         tier_credits_final = VALUES(tier_credits_final),
         grace_active = VALUES(grace_active),
         total_hours = VALUES(total_hours),
         direct_hours = VALUES(direct_hours),
         indirect_hours = VALUES(indirect_hours),
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
        noNoteUnits,
        draftUnits,
        finalizedUnits,
        tierCreditsCurrent,
        tierCreditsPrior,
        tierCreditsFinal,
        graceActive ? 1 : 0,
        totalHours,
        directHours,
        indirectHours,
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
    // NOTE: Some MySQL setups/drivers error on prepared placeholders in LIMIT/OFFSET.
    // Use sanitized numeric literals for LIMIT/OFFSET to avoid ER_WRONG_ARGUMENTS.
    const lim = Math.max(0, Math.min(500, parseInt(limit, 10) || 50));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const [rows] = await pool.execute(
      `SELECT ps.*, pp.label, pp.period_start, pp.period_end, pp.status
       FROM payroll_summaries ps
       JOIN payroll_periods pp ON ps.payroll_period_id = pp.id
       WHERE ${where}
       ORDER BY pp.period_start DESC
       LIMIT ${lim} OFFSET ${off}`,
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

