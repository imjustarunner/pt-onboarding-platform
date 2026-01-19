import pool from '../config/database.js';

class PayrollMedcancelClaim {
  static async findSuggestedPeriodId({ agencyId, claimDate }) {
    if (!agencyId || !claimDate) return null;
    const [rows] = await pool.execute(
      `SELECT id
       FROM payroll_periods
       WHERE agency_id = ?
         AND ? BETWEEN period_start AND period_end
       ORDER BY id DESC
       LIMIT 1`,
      [agencyId, claimDate]
    );
    return rows?.[0]?.id || null;
  }

  static async create({
    agencyId,
    userId,
    claimDate,
    schoolOrganizationId = null,
    units = 0,
    notes = null,
    attestation = 0,
    suggestedPayrollPeriodId = null
  }) {
    const resolvedSuggestedPayrollPeriodId =
      Number.isFinite(Number(suggestedPayrollPeriodId)) && Number(suggestedPayrollPeriodId) > 0
        ? Number(suggestedPayrollPeriodId)
        : await PayrollMedcancelClaim.findSuggestedPeriodId({ agencyId, claimDate });
    const safeUnits = Number.isFinite(Number(units)) ? Number(units) : 0;
    const [result] = await pool.execute(
      `INSERT INTO payroll_medcancel_claims
       (agency_id, user_id, status, claim_date, school_organization_id, units, notes, attestation, suggested_payroll_period_id)
       VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        userId,
        claimDate,
        schoolOrganizationId,
        safeUnits,
        notes || null,
        attestation ? 1 : 0,
        resolvedSuggestedPayrollPeriodId
      ]
    );
    const id = result?.insertId || null;
    return id ? PayrollMedcancelClaim.findById(id) : null;
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM payroll_medcancel_claims WHERE id = ? LIMIT 1`, [id]);
    return rows?.[0] || null;
  }

  static async listForUser({ agencyId, userId, status = null, limit = 200, offset = 0 }) {
    const lim = Math.max(1, Math.min(500, Number(limit || 200)));
    const off = Math.max(0, Number(offset || 0));
    const params = [agencyId, userId];
    let where = `agency_id = ? AND user_id = ?`;
    if (status) {
      where += ` AND status = ?`;
      params.push(String(status));
    }
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_medcancel_claims
       WHERE ${where}
       ORDER BY claim_date DESC, id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows || [];
  }

  static async listForAgency({
    agencyId,
    status = null,
    suggestedPayrollPeriodId = null,
    targetPayrollPeriodId = null,
    userId = null,
    limit = 500,
    offset = 0
  }) {
    const lim = Math.max(1, Math.min(1000, Number(limit || 500)));
    const off = Math.max(0, Number(offset || 0));

    const params = [agencyId];
    const conds = [`agency_id = ?`];
    if (status) {
      const st = String(status);
      // "submitted" means truly pending approval. Returned claims use 'deferred' and should not appear as pending.
      conds.push(`status = ?`);
      params.push(st);
    }
    if (Number.isFinite(Number(suggestedPayrollPeriodId)) && Number(suggestedPayrollPeriodId) > 0) {
      conds.push(`suggested_payroll_period_id = ?`);
      params.push(Number(suggestedPayrollPeriodId));
    }
    if (Number.isFinite(Number(targetPayrollPeriodId)) && Number(targetPayrollPeriodId) > 0) {
      conds.push(`target_payroll_period_id = ?`);
      params.push(Number(targetPayrollPeriodId));
    }
    if (Number.isFinite(Number(userId)) && Number(userId) > 0) {
      conds.push(`user_id = ?`);
      params.push(Number(userId));
    }

    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_medcancel_claims
       WHERE ${conds.join(' AND ')}
       ORDER BY status ASC, claim_date DESC, id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows || [];
  }

  static async approve({
    id,
    approverUserId,
    targetPayrollPeriodId,
    serviceCode,
    rateAmount,
    rateUnit,
    appliedAmount
  }) {
    await pool.execute(
      `UPDATE payroll_medcancel_claims
       SET status = 'approved',
           target_payroll_period_id = ?,
           service_code = ?,
           rate_amount = ?,
           rate_unit = ?,
           applied_amount = ?,
           approved_by_user_id = ?,
           approved_at = NOW(),
           rejection_reason = NULL,
           rejected_by_user_id = NULL,
           rejected_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [targetPayrollPeriodId, serviceCode, rateAmount, rateUnit, appliedAmount, approverUserId, id]
    );
    return PayrollMedcancelClaim.findById(id);
  }

  static async reject({ id, rejectorUserId, rejectionReason }) {
    await pool.execute(
      `UPDATE payroll_medcancel_claims
       SET status = 'rejected',
           rejection_reason = ?,
           rejected_by_user_id = ?,
           rejected_at = NOW()
       WHERE id = ?
       LIMIT 1`,
      [rejectionReason || null, rejectorUserId, id]
    );
    return PayrollMedcancelClaim.findById(id);
  }

  static async defer({ id }) {
    await pool.execute(
      `UPDATE payroll_medcancel_claims
       SET status = 'deferred'
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return PayrollMedcancelClaim.findById(id);
  }

  // "Returned" == needs changes. We reuse the existing 'deferred' status to avoid schema changes.
  static async returnForChanges({ id, actorUserId, note }) {
    await pool.execute(
      `UPDATE payroll_medcancel_claims
       SET status = 'deferred',
           rejection_reason = ?,
           rejected_by_user_id = ?,
           rejected_at = NOW(),
           target_payroll_period_id = NULL,
           service_code = NULL,
           rate_amount = NULL,
           rate_unit = NULL,
           applied_amount = NULL,
           approved_by_user_id = NULL,
           approved_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [String(note || '').trim().slice(0, 255) || null, actorUserId || null, id]
    );
    return PayrollMedcancelClaim.findById(id);
  }

  static async unapprove({ id }) {
    await pool.execute(
      `UPDATE payroll_medcancel_claims
       SET status = 'submitted',
           target_payroll_period_id = NULL,
           service_code = NULL,
           rate_amount = NULL,
           rate_unit = NULL,
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
    return PayrollMedcancelClaim.findById(id);
  }

  static async sumApprovedForPeriodUser({ payrollPeriodId, agencyId, userId }) {
    const [rows] = await pool.execute(
      `SELECT SUM(applied_amount) AS total
       FROM payroll_medcancel_claims
       WHERE agency_id = ?
         AND user_id = ?
         AND status IN ('approved','paid')
         AND target_payroll_period_id = ?`,
      [agencyId, userId, payrollPeriodId]
    );
    return Number(rows?.[0]?.total || 0);
  }

  static async countUnresolvedForPeriod({ payrollPeriodId, agencyId }) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM payroll_medcancel_claims
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
      `SELECT *
       FROM payroll_medcancel_claims
       WHERE agency_id = ?
         AND status = 'submitted'
         AND (
           target_payroll_period_id = ?
           OR (target_payroll_period_id IS NULL AND suggested_payroll_period_id = ?)
         )
       ORDER BY claim_date DESC, id DESC
       LIMIT ${lim}`,
      [agencyId, payrollPeriodId, payrollPeriodId]
    );
    return rows || [];
  }
}

export default PayrollMedcancelClaim;

