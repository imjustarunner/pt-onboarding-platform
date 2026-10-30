import pool from '../config/database.js';
import { applyActualHoursReview, payrollHoursSourceFingerprint, payrollPeriodIsLocked, validateActualHoursReview } from '../utils/payrollActualHoursReview.js';
import { calculateSickLeaveHours } from '../utils/payrollSickLeaveHours.js';
const failure = (status, message) => Object.assign(new Error(message), { status });
export default class PayrollActualHoursReview {
  static async latest({ agencyId, payrollPeriodId, userId, db = pool }) {
    try {
      const [rows] = await db.execute('SELECT * FROM payroll_actual_hours_reviews WHERE agency_id=? AND payroll_period_id=? AND user_id=? ORDER BY id DESC LIMIT 1', [agencyId, payrollPeriodId, userId]);
      return rows[0] || null;
    } catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return null; throw error; }
  }
  static async save({ agencyId, payrollPeriodId, userId, actorUserId, body, db = pool }) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [periodRows] = await conn.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=? FOR UPDATE', [payrollPeriodId, agencyId]);
      const period = periodRows[0];
      if (!period) throw failure(404, 'Pay period not found.');
      if (payrollPeriodIsLocked(period)) throw failure(409, 'Posted or finalized payroll cannot be changed here. Use the existing correction workflow.');
      const [summaries] = await conn.execute('SELECT * FROM payroll_summaries WHERE payroll_period_id=? AND agency_id=? AND user_id=? FOR UPDATE', [payrollPeriodId, agencyId, userId]);
      const summary = summaries[0];
      if (!summary) throw failure(409, 'Run payroll for this employee before reviewing actual hours.');
      const [members] = await conn.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? LIMIT 1', [userId, agencyId]);
      if (!members.length) throw failure(409, 'The employee is not assigned to this payroll organization.');
      const days = Math.round((new Date(period.period_end).getTime() - new Date(period.period_start).getTime()) / 86400000) + 1;
      const values = validateActualHoursReview(body, Math.max(1, days) * 24);
      const previous = await this.latest({ agencyId, payrollPeriodId, userId, db: conn });
      if (Number(body.expectedReviewId || 0) !== Number(previous?.id || 0)) throw failure(409, 'Another reviewer changed this record. Reload and review the latest entry.');
      const fingerprint = payrollHoursSourceFingerprint(summary);
      if (body.expectedSummaryFingerprint !== fingerprint) throw failure(409, 'The payroll calculation changed. Reload the worksheet before attesting to its hours.');
      const [inserted] = await conn.execute(`INSERT INTO payroll_actual_hours_reviews (agency_id,payroll_period_id,user_id,actual_worked_hours,statutory_sick_basis_hours,source_reference,reconciliation_note,summary_fingerprint,supersedes_review_id,reviewed_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`, [agencyId, payrollPeriodId, userId, values.actualWorkedHours, values.statutorySickBasisHours, values.sourceReference, values.reconciliationNote, fingerprint, previous?.id || null, actorUserId]);
      const review = { id: inserted.insertId, agency_id: agencyId, payroll_period_id: payrollPeriodId, user_id: userId, actual_worked_hours: values.actualWorkedHours, statutory_sick_basis_hours: values.statutorySickBasisHours, source_reference: values.sourceReference, reconciliation_note: values.reconciliationNote, summary_fingerprint: fingerprint, supersedes_review_id: previous?.id || null, reviewed_by_user_id: actorUserId, reviewed_at: new Date().toISOString() };
      const updated = applyActualHoursReview(summary, review);
      updated.breakdown.__sickLeaveHours = calculateSickLeaveHours(updated);
      await conn.execute('UPDATE payroll_summaries SET breakdown=? WHERE id=? AND agency_id=?', [JSON.stringify(updated.breakdown), summary.id, agencyId]);
      await conn.commit();
      return { review, sickLeaveSummary: updated.breakdown.__sickLeaveHours };
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
}
