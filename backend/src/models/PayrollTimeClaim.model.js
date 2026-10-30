import { withReviewedEventTravelClaim } from '../utils/eventTravelApproval.js';
import pool from '../config/database.js';

class PayrollTimeClaim {
  static async create({
    agencyId,
    userId,
    submittedByUserId = null,
    status = 'submitted',
    claimType,
    claimDate,
    payload,
    suggestedPayrollPeriodId = null,
    db = pool
  }) {
    const payloadJson = JSON.stringify(payload || {});
    const [result] = await db.execute(
      `INSERT INTO payroll_time_claims
       (agency_id, user_id, submitted_by_user_id, status, claim_type, claim_date, payload_json, suggested_payroll_period_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        userId,
        (Number.isFinite(Number(submittedByUserId)) && Number(submittedByUserId) > 0) ? Number(submittedByUserId) : Number(userId),
        String(status || 'submitted'),
        String(claimType),
        claimDate,
        payloadJson,
        suggestedPayrollPeriodId
      ]
    );
    return this.findById(result.insertId, db);
  }

  static async findById(id, db = pool) {
    const [rows] = await db.execute(
      `SELECT c.*,
              sb.first_name AS submitted_by_first_name,
              sb.last_name AS submitted_by_last_name,
              sb.email AS submitted_by_email
       FROM payroll_time_claims c
       LEFT JOIN users sb ON sb.id = c.submitted_by_user_id
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    );
    const row = rows?.[0] || null;
    return row ? this._normalize(row) : null;
  }

  static _normalize(row) {
    if (!row) return null;
    let payload = {};
    try {
      payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : (row.payload_json || {});
    } catch {
      payload = {};
    }
    // Carryovers retain exact approved minutes in their audit payload; the
    // legacy credits_hours column stores only hundredths of an hour.
    const carryoverMinutes = Number(payload.totalMinutes);
    const exactCarryover = row.claim_type === 'indirect_time'
      && payload.source === 'direct_care_auto_indirect_carryover'
      && ['approved', 'paid'].includes(row.status)
      && Number.isFinite(carryoverMinutes) && carryoverMinutes > 0;
    return { ...row, ...(exactCarryover ? { credits_hours: carryoverMinutes / 60 } : {}), payload };
  }

  static async listForUser({ agencyId, userId, status = null, limit = 200, offset = 0 }) {
    const lim = Math.max(1, Math.min(500, Number(limit || 200)));
    const off = Math.max(0, Number(offset || 0));
    const params = [agencyId, userId];
    let where = `c.agency_id = ? AND c.user_id = ?`;
    if (status) {
      where += ` AND c.status = ?`;
      params.push(String(status));
    }
    const [rows] = await pool.execute(
      `SELECT c.*,
              sb.first_name AS submitted_by_first_name,
              sb.last_name AS submitted_by_last_name,
              sb.email AS submitted_by_email
       FROM payroll_time_claims c
       LEFT JOIN users sb ON sb.id = c.submitted_by_user_id
       WHERE ${where}
       ORDER BY c.claim_date DESC, c.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return (rows || []).map((r) => this._normalize(r));
  }

  static async listForAgency({
    agencyId,
    status = null,
    unpostedOnly = false,
    excludeEventTime = false,
    suggestedPayrollPeriodId = null,
    targetPayrollPeriodId = null,
    userId = null,
    limit = 200,
    offset = 0
  }) {
    const lim = Math.max(1, Math.min(500, Number(limit || 200)));
    const off = Math.max(0, Number(offset || 0));
    const params = [agencyId];
    const conds = [`c.agency_id = ?`];

    if (status) {
      const st = String(status);
      // "submitted" means truly pending approval. Returned claims use 'deferred' and should not appear as pending.
      conds.push(`c.status = ?`);
      params.push(st);
    }
    if (Number.isFinite(Number(suggestedPayrollPeriodId)) && Number(suggestedPayrollPeriodId) > 0) {
      conds.push(`c.suggested_payroll_period_id = ?`);
      params.push(Number(suggestedPayrollPeriodId));
    }
    if (Number.isFinite(Number(targetPayrollPeriodId)) && Number(targetPayrollPeriodId) > 0) {
      conds.push(`c.target_payroll_period_id = ?`);
      params.push(Number(targetPayrollPeriodId));
    }
    if (Number.isFinite(Number(userId)) && Number(userId) > 0) {
      conds.push(`c.user_id = ?`);
      params.push(Number(userId));
    }

    if (excludeEventTime) conds.push("c.claim_type <> 'skill_builder_event'");
    if (unpostedOnly) {
      conds.push("c.status = 'approved'", "p.id IS NOT NULL", "LOWER(p.status) NOT IN ('posted', 'finalized')",
        'p.posted_at IS NULL', 'p.finalized_at IS NULL', 'p.posted_by_user_id IS NULL', 'p.finalized_by_user_id IS NULL');
    }

    const [rows] = await pool.execute(
      `SELECT c.*,
              p.period_start AS approved_period_start,
              p.period_end AS approved_period_end,
              p.status AS target_period_status,
              approver.first_name AS approved_by_first_name,
              approver.last_name AS approved_by_last_name,
              sb.first_name AS submitted_by_first_name,
              sb.last_name AS submitted_by_last_name,
              sb.email AS submitted_by_email
       FROM payroll_time_claims c
       LEFT JOIN users sb ON sb.id = c.submitted_by_user_id
       LEFT JOIN payroll_periods p ON p.id = c.target_payroll_period_id AND p.agency_id = c.agency_id
       LEFT JOIN users approver ON approver.id = c.approved_by_user_id
       WHERE ${conds.join(' AND ')}
       ORDER BY c.status ASC, c.claim_date DESC, c.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return (rows || []).map((r) => this._normalize(r));
  }

  static async approve({ id, approverUserId, targetPayrollPeriodId, appliedAmount, bucket = 'indirect', creditsHours = null, eventTravelReviewedAt = null }) {
    const raw = String(bucket || 'indirect').trim().toLowerCase();
    const b = raw === 'direct'
      ? 'direct'
      : (raw === 'other_1' || raw === 'other_2' || raw === 'other_3' ? raw : 'indirect');
    const hrsRaw = creditsHours === null || creditsHours === undefined || creditsHours === '' ? null : Number(creditsHours);
    const safeHrs = Number.isFinite(hrsRaw) ? Math.round(hrsRaw * 100) / 100 : null;
    const persist = async (db) => {
      const [result] = await db.execute(
        `UPDATE payroll_time_claims
         SET status = 'approved',
             target_payroll_period_id = ?,
             bucket = ?,
             credits_hours = ?,
             applied_amount = ?,
             approved_by_user_id = ?,
             approved_at = NOW(),
             rejection_reason = NULL,
             rejected_by_user_id = NULL,
             rejected_at = NULL
         WHERE id = ? ${eventTravelReviewedAt ? `AND EXISTS (
           SELECT 1 FROM company_event_travel_reports r WHERE r.id = payroll_time_claims.event_travel_report_id
           AND r.reviewed_at IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(r.report_json, '$.reviewedAt')) = ?)` : ''}
         LIMIT 1`,
        [targetPayrollPeriodId, b, safeHrs, appliedAmount, approverUserId, id, ...(eventTravelReviewedAt ? [eventTravelReviewedAt] : [])]
      );
      if (eventTravelReviewedAt && !result.affectedRows) throw Object.assign(new Error('The travel report changed. Refresh and review it before approval.'), { status: 409 });
      return PayrollTimeClaim.findById(id, db);
    };
    return eventTravelReviewedAt
      ? withReviewedEventTravelClaim({ table: 'payroll_time_claims', id, reviewedAt: eventTravelReviewedAt }, persist)
      : persist(pool);
  }

  static async updateApproved({ id, bucket, creditsHours, appliedAmount, payload = null }) {
    const raw = String(bucket || 'indirect').trim().toLowerCase();
    const b = raw === 'direct'
      ? 'direct'
      : (raw === 'other_1' || raw === 'other_2' || raw === 'other_3' ? raw : 'indirect');
    const hrsRaw = creditsHours === null || creditsHours === undefined || creditsHours === '' ? null : Number(creditsHours);
    const safeHrs = Number.isFinite(hrsRaw) ? Math.round(hrsRaw * 100) / 100 : null;
    const amtRaw = appliedAmount === null || appliedAmount === undefined || appliedAmount === '' ? null : Number(appliedAmount);
    const safeAmt = Number.isFinite(amtRaw) ? Math.round(amtRaw * 100) / 100 : null;
    const sets = ['bucket = ?', 'credits_hours = ?', 'applied_amount = ?'];
    const params = [b, safeHrs, safeAmt];
    if (payload != null) {
      sets.push('payload_json = ?');
      params.push(JSON.stringify(payload || {}));
    }
    params.push(id);
    await pool.execute(
      `UPDATE payroll_time_claims SET ${sets.join(', ')} WHERE id = ? LIMIT 1`,
      params
    );
    return PayrollTimeClaim.findById(id);
  }

  static async reject({ id, rejectorUserId, rejectionReason }) {
    await pool.execute(
      `UPDATE payroll_time_claims
       SET status = 'rejected',
           rejection_reason = ?,
           rejected_by_user_id = ?,
           rejected_at = NOW()
       WHERE id = ?
       LIMIT 1`,
      [rejectionReason || null, rejectorUserId, id]
    );
    return PayrollTimeClaim.findById(id);
  }

  static async returnForChanges({ id, actorUserId, note }) {
    await pool.execute(
      `UPDATE payroll_time_claims
       SET status = 'deferred',
           rejection_reason = ?,
           rejected_by_user_id = ?,
           rejected_at = NOW(),
           target_payroll_period_id = NULL,
           applied_amount = NULL,
           approved_by_user_id = NULL,
           approved_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [String(note || '').trim().slice(0, 255) || null, actorUserId || null, id]
    );
    return PayrollTimeClaim.findById(id);
  }

  static async unapprove({ id }) {
    await pool.execute(
      `UPDATE payroll_time_claims
       SET status = 'submitted',
           target_payroll_period_id = NULL,
           applied_amount = NULL,
           approved_by_user_id = NULL,
           approved_at = NULL,
           rejection_reason = NULL,
           rejected_by_user_id = NULL,
           rejected_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return PayrollTimeClaim.findById(id);
  }

  static async moveTargetPeriod({ id, targetPayrollPeriodId }) {
    await pool.execute(
      `UPDATE payroll_time_claims
       SET target_payroll_period_id = ?
       WHERE id = ?
       LIMIT 1`,
      [targetPayrollPeriodId, id]
    );
    return PayrollTimeClaim.findById(id);
  }

  static async updatePayload({ id, payload, db = pool }) {
    await db.execute(
      `UPDATE payroll_time_claims
       SET payload_json = ?
       WHERE id = ?
       LIMIT 1`,
      [JSON.stringify(payload || {}), id]
    );
    return PayrollTimeClaim.findById(id, db);
  }

  /** Employee withdrew from payroll review — keep row for edit/resubmit. */
  static async softWithdraw({ id }) {
    await pool.execute(
      `UPDATE payroll_time_claims
       SET status = 'withdrawn',
           target_payroll_period_id = NULL,
           applied_amount = NULL,
           approved_by_user_id = NULL,
           approved_at = NULL,
           rejection_reason = NULL,
           rejected_by_user_id = NULL,
           rejected_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return this.findById(id);
  }

  /** Resubmit after edit/withdraw — back to pending review. */
  static async resubmit({ id, claimDate = null, payload = null, db = pool }) {
    const sets = [
      `status = 'submitted'`,
      `target_payroll_period_id = NULL`,
      `applied_amount = NULL`,
      `approved_by_user_id = NULL`,
      `approved_at = NULL`,
      `rejection_reason = NULL`,
      `rejected_by_user_id = NULL`,
      `rejected_at = NULL`
    ];
    const params = [];
    if (claimDate) {
      sets.push('claim_date = ?');
      params.push(claimDate);
    }
    if (payload != null) {
      sets.push('payload_json = ?');
      params.push(JSON.stringify(payload || {}));
    }
    params.push(id);
    await db.execute(
      `UPDATE payroll_time_claims SET ${sets.join(', ')} WHERE id = ? LIMIT 1`,
      params
    );
    return this.findById(id, db);
  }

  static async hardDelete({ id }) {
    await pool.execute('DELETE FROM payroll_time_claims WHERE id = ? LIMIT 1', [id]);
    return true;
  }

  static async sumApprovedForPeriodUser({ payrollPeriodId, agencyId, userId }) {
    const [rows] = await pool.execute(
      `SELECT SUM(applied_amount) AS total
       FROM payroll_time_claims
       WHERE agency_id = ?
         AND user_id = ?
         AND status IN ('approved','paid')
         AND target_payroll_period_id = ?`,
      [agencyId, userId, payrollPeriodId]
    );
    return Number(rows?.[0]?.total || 0);
  }

  static async listApprovedForPeriodUser({ payrollPeriodId, agencyId, userId }) {
    const [rows] = await pool.execute(
      `SELECT c.*,
              sb.first_name AS submitted_by_first_name,
              sb.last_name AS submitted_by_last_name,
              sb.email AS submitted_by_email
       FROM payroll_time_claims c
       LEFT JOIN users sb ON sb.id = c.submitted_by_user_id
       WHERE c.agency_id = ?
         AND c.user_id = ?
         AND c.status IN ('approved','paid')
         AND c.target_payroll_period_id = ?
       ORDER BY c.claim_date ASC, c.id ASC`,
      [agencyId, userId, payrollPeriodId]
    );
    return (rows || []).map((r) => this._normalize(r));
  }

  static async countUnresolvedForPeriod({ payrollPeriodId, agencyId }) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM payroll_time_claims
       WHERE agency_id = ?
         AND status = 'submitted'
         AND (
           target_payroll_period_id = ?
           OR (target_payroll_period_id IS NULL AND suggested_payroll_period_id = ?)
         )`,
      [agencyId, payrollPeriodId, payrollPeriodId]
    );
    return Number(rows?.[0]?.cnt || 0);
  }

  static async listUnresolvedForPeriod({ payrollPeriodId, agencyId, limit = 50 }) {
    const lim = Math.max(1, Math.min(200, Number(limit || 50)));
    const [rows] = await pool.execute(
      `SELECT c.*,
              sb.first_name AS submitted_by_first_name,
              sb.last_name AS submitted_by_last_name,
              sb.email AS submitted_by_email
       FROM payroll_time_claims c
       LEFT JOIN users sb ON sb.id = c.submitted_by_user_id
       WHERE c.agency_id = ?
         AND c.status = 'submitted'
         AND (
           c.target_payroll_period_id = ?
           OR (c.target_payroll_period_id IS NULL AND c.suggested_payroll_period_id = ?)
         )
       ORDER BY c.claim_date DESC, c.id DESC
       LIMIT ${lim}`,
      [agencyId, payrollPeriodId, payrollPeriodId]
    );
    return (rows || []).map((r) => this._normalize(r));
  }
}

export default PayrollTimeClaim;
