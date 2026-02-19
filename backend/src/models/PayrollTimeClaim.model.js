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
    suggestedPayrollPeriodId = null
  }) {
    const payloadJson = JSON.stringify(payload || {});
    const [result] = await pool.execute(
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
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
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
    return { ...row, payload };
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

    const [rows] = await pool.execute(
      `SELECT c.*,
              sb.first_name AS submitted_by_first_name,
              sb.last_name AS submitted_by_last_name,
              sb.email AS submitted_by_email
       FROM payroll_time_claims c
       LEFT JOIN users sb ON sb.id = c.submitted_by_user_id
       WHERE ${conds.join(' AND ')}
       ORDER BY c.status ASC, c.claim_date DESC, c.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return (rows || []).map((r) => this._normalize(r));
  }

  static async approve({ id, approverUserId, targetPayrollPeriodId, appliedAmount, bucket = 'indirect', creditsHours = null }) {
    const b = String(bucket || 'indirect').trim().toLowerCase() === 'direct' ? 'direct' : 'indirect';
    const hrsRaw = creditsHours === null || creditsHours === undefined || creditsHours === '' ? null : Number(creditsHours);
    const safeHrs = Number.isFinite(hrsRaw) ? Math.round(hrsRaw * 100) / 100 : null;
    await pool.execute(
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
       WHERE id = ?
       LIMIT 1`,
      [targetPayrollPeriodId, b, safeHrs, appliedAmount, approverUserId, id]
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

  static async updatePayload({ id, payload }) {
    await pool.execute(
      `UPDATE payroll_time_claims
       SET payload_json = ?
       WHERE id = ?
       LIMIT 1`,
      [JSON.stringify(payload || {}), id]
    );
    return PayrollTimeClaim.findById(id);
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

