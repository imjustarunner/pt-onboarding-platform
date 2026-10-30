import pool from '../config/database.js';
import { calculateSickLeaveHours, withSickLeaveHours } from '../utils/payrollSickLeaveHours.js';
import PayrollActualHoursReview from './PayrollActualHoursReview.model.js';
import { applyActualHoursReview } from '../utils/payrollActualHoursReview.js';

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
    if (breakdown && typeof breakdown === 'object') {
      const review = await PayrollActualHoursReview.latest({ agencyId, payrollPeriodId, userId });
      const reviewed = applyActualHoursReview({ breakdown, direct_hours: directHours, indirect_hours: indirectHours, total_hours: totalHours, total_amount: totalAmount }, review);
      breakdown = reviewed.breakdown;
      const [periods] = await pool.execute('SELECT pp.period_start, a.pto_policy_json FROM payroll_periods pp JOIN agencies a ON a.id=pp.agency_id WHERE pp.id=? AND pp.agency_id=?', [payrollPeriodId, agencyId]);
      const context = periods[0];
      const policy = typeof context?.pto_policy_json === 'string' ? JSON.parse(context.pto_policy_json) : context?.pto_policy_json;
      // Recompute on an explicit summary save; reads still preserve saved snapshots.
      delete breakdown.__sickLeaveHours;
      const annotated = withSickLeaveHours(reviewed, { policy: policy || {}, periodStart: context?.period_start });
      if (annotated.sick_leave_summary) breakdown.__sickLeaveHours = annotated.sick_leave_summary;
      else delete breakdown.__sickLeaveHours;
    }
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
      `SELECT ps.*, u.first_name, u.last_name, u.email, pp.period_start, a.pto_policy_json AS sick_leave_policy
       FROM payroll_summaries ps
       JOIN users u ON ps.user_id = u.id
       JOIN payroll_periods pp ON pp.id=ps.payroll_period_id
       JOIN agencies a ON a.id=ps.agency_id
       WHERE ps.payroll_period_id = ?
       ORDER BY ps.total_amount DESC`,
      [payrollPeriodId]
    );
    return rows.map((r) => {
      if (typeof r.breakdown === 'string') {
        try { r.breakdown = JSON.parse(r.breakdown); } catch { /* ignore */ }
      }
      const { sick_leave_policy, ...row } = r;
      const policy = typeof sick_leave_policy === 'string' ? JSON.parse(sick_leave_policy) : sick_leave_policy;
      return withSickLeaveHours(row, { policy: policy || {}, periodStart: row.period_start });
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
      `SELECT ps.*, pp.label, pp.period_start, pp.period_end, pp.status, a.pto_policy_json AS sick_leave_policy
       FROM payroll_summaries ps
       JOIN payroll_periods pp ON ps.payroll_period_id = pp.id
       JOIN agencies a ON a.id=ps.agency_id
       WHERE ${where}
       ORDER BY pp.period_start DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows.map((r) => {
      if (typeof r.breakdown === 'string') {
        try { r.breakdown = JSON.parse(r.breakdown); } catch { /* ignore */ }
      }
      const { sick_leave_policy, ...row } = r;
      const policy = typeof sick_leave_policy === 'string' ? JSON.parse(sick_leave_policy) : sick_leave_policy;
      return withSickLeaveHours(row, { policy: policy || {}, periodStart: row.period_start });
    });
  }
}

export default PayrollSummary;
