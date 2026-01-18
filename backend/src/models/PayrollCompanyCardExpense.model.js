import pool from '../config/database.js';

class PayrollCompanyCardExpense {
  static async create({
    agencyId,
    userId,
    status = 'submitted',
    expenseDate,
    amount,
    vendor = null,
    purpose = null,
    notes,
    attestation = 0,
    receiptFilePath = null,
    receiptOriginalName = null,
    receiptMimeType = null,
    receiptSizeBytes = null,
    suggestedPayrollPeriodId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO payroll_company_card_expenses
       (agency_id, user_id, status, expense_date, amount, vendor, purpose, notes, attestation,
        receipt_file_path, receipt_original_name, receipt_mime_type, receipt_size_bytes,
        suggested_payroll_period_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?)`,
      [
        agencyId,
        userId,
        String(status || 'submitted'),
        expenseDate,
        amount,
        vendor,
        purpose,
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
    const [rows] = await pool.execute('SELECT * FROM payroll_company_card_expenses WHERE id = ? LIMIT 1', [id]);
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
       FROM payroll_company_card_expenses
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
      conds.push(`status = ?`);
      params.push(String(status));
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
       FROM payroll_company_card_expenses
       WHERE ${conds.join(' AND ')}
       ORDER BY status ASC, expense_date DESC, id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows || [];
  }

  static async approve({ id, approverUserId, appliedAmount = 0, targetPayrollPeriodId = null }) {
    await pool.execute(
      `UPDATE payroll_company_card_expenses
       SET status = 'approved',
           applied_amount = ?,
           target_payroll_period_id = ?,
           approved_by_user_id = ?,
           approved_at = NOW(),
           rejected_by_user_id = NULL,
           rejected_at = NULL,
           rejection_reason = NULL
       WHERE id = ?
       LIMIT 1`,
      [Number(appliedAmount || 0), targetPayrollPeriodId ? Number(targetPayrollPeriodId) : null, Number(approverUserId), Number(id)]
    );
    return this.findById(id);
  }

  static async reject({ id, rejectorUserId, rejectionReason }) {
    await pool.execute(
      `UPDATE payroll_company_card_expenses
       SET status = 'rejected',
           rejected_by_user_id = ?,
           rejected_at = NOW(),
           rejection_reason = ?,
           approved_by_user_id = NULL,
           approved_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [Number(rejectorUserId), String(rejectionReason || '').slice(0, 255), Number(id)]
    );
    return this.findById(id);
  }

  static async returnForChanges({ id, actorUserId, note }) {
    await pool.execute(
      `UPDATE payroll_company_card_expenses
       SET status = 'deferred',
           rejected_by_user_id = ?,
           rejected_at = NOW(),
           rejection_reason = ?,
           approved_by_user_id = NULL,
           approved_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [Number(actorUserId), String(note || '').slice(0, 255), Number(id)]
    );
    return this.findById(id);
  }

  static async unapprove({ id }) {
    await pool.execute(
      `UPDATE payroll_company_card_expenses
       SET status = 'submitted',
           applied_amount = 0,
           target_payroll_period_id = NULL,
           approved_by_user_id = NULL,
           approved_at = NULL,
           rejected_by_user_id = NULL,
           rejected_at = NULL,
           rejection_reason = NULL
       WHERE id = ?
       LIMIT 1`,
      [Number(id)]
    );
    return this.findById(id);
  }

  static async moveTargetPeriod({ id, targetPayrollPeriodId }) {
    await pool.execute(
      `UPDATE payroll_company_card_expenses
       SET target_payroll_period_id = ?
       WHERE id = ?
       LIMIT 1`,
      [targetPayrollPeriodId ? Number(targetPayrollPeriodId) : null, Number(id)]
    );
    return this.findById(id);
  }
}

export default PayrollCompanyCardExpense;

