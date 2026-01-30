import pool from '../config/database.js';

class PayrollReimbursementClaim {
  static async create({
    agencyId,
    userId,
    status = 'submitted',
    expenseDate,
    amount,
    paymentMethod = null,
    vendor = null,
    purchaseApprovedBy = null,
    purchasePreapproved = null,
    projectRef = null,
    reason = null,
    splitsJson = null,
    category = null,
    notes = null,
    attestation = 0,
    receiptFilePath = null,
    receiptOriginalName = null,
    receiptMimeType = null,
    receiptSizeBytes = null,
    suggestedPayrollPeriodId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO payroll_reimbursement_claims
       (agency_id, user_id, status, expense_date, amount, payment_method, vendor, purchase_approved_by, purchase_preapproved, project_ref, reason, splits_json, category, notes, attestation,
        receipt_file_path, receipt_original_name, receipt_mime_type, receipt_size_bytes,
        suggested_payroll_period_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        userId,
        String(status || 'submitted'),
        expenseDate,
        amount,
        paymentMethod,
        vendor,
        purchaseApprovedBy,
        purchasePreapproved,
        projectRef,
        reason,
        splitsJson,
        category,
        notes,
        attestation ? 1 : 0,
        receiptFilePath,
        receiptOriginalName,
        receiptMimeType,
        receiptSizeBytes,
        suggestedPayrollPeriodId
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM payroll_reimbursement_claims WHERE id = ? LIMIT 1', [id]);
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
       FROM payroll_reimbursement_claims
       WHERE ${where}
       ORDER BY expense_date DESC, id DESC
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
    limit = 200,
    offset = 0
  }) {
    const lim = Math.max(1, Math.min(500, Number(limit || 200)));
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
       FROM payroll_reimbursement_claims
       WHERE ${conds.join(' AND ')}
       ORDER BY status ASC, expense_date DESC, id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows || [];
  }

  static async approve({ id, approverUserId, targetPayrollPeriodId, appliedAmount }) {
    await pool.execute(
      `UPDATE payroll_reimbursement_claims
       SET status = 'approved',
           target_payroll_period_id = ?,
           applied_amount = ?,
           approved_by_user_id = ?,
           approved_at = NOW(),
           rejection_reason = NULL,
           rejected_by_user_id = NULL,
           rejected_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [targetPayrollPeriodId, appliedAmount, approverUserId, id]
    );
    return PayrollReimbursementClaim.findById(id);
  }

  static async reject({ id, rejectorUserId, rejectionReason }) {
    await pool.execute(
      `UPDATE payroll_reimbursement_claims
       SET status = 'rejected',
           rejection_reason = ?,
           rejected_by_user_id = ?,
           rejected_at = NOW()
       WHERE id = ?
       LIMIT 1`,
      [rejectionReason || null, rejectorUserId, id]
    );
    return PayrollReimbursementClaim.findById(id);
  }

  static async returnForChanges({ id, actorUserId, note }) {
    await pool.execute(
      `UPDATE payroll_reimbursement_claims
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
    return PayrollReimbursementClaim.findById(id);
  }

  static async unapprove({ id }) {
    await pool.execute(
      `UPDATE payroll_reimbursement_claims
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
    return PayrollReimbursementClaim.findById(id);
  }

  static async moveTargetPeriod({ id, targetPayrollPeriodId }) {
    await pool.execute(
      `UPDATE payroll_reimbursement_claims
       SET target_payroll_period_id = ?
       WHERE id = ?
       LIMIT 1`,
      [targetPayrollPeriodId, id]
    );
    return PayrollReimbursementClaim.findById(id);
  }

  static async sumApprovedForPeriodUser({ payrollPeriodId, agencyId, userId }) {
    const [rows] = await pool.execute(
      `SELECT SUM(applied_amount) AS total
       FROM payroll_reimbursement_claims
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
       FROM payroll_reimbursement_claims
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
       FROM payroll_reimbursement_claims
       WHERE agency_id = ?
         AND status = 'submitted'
         AND (
           target_payroll_period_id = ?
           OR (target_payroll_period_id IS NULL AND suggested_payroll_period_id = ?)
         )
       ORDER BY expense_date DESC, id DESC
       LIMIT ${lim}`,
      [agencyId, payrollPeriodId, payrollPeriodId]
    );
    return rows || [];
  }
}

export default PayrollReimbursementClaim;

