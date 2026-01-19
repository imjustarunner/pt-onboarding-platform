import pool from '../config/database.js';

class PayrollPtoLedger {
  static async create({
    agencyId,
    userId,
    entryType,
    ptoBucket,
    hoursDelta,
    effectiveDate,
    payrollPeriodId = null,
    requestId = null,
    note = null,
    createdByUserId
  }) {
    const [res] = await pool.execute(
      `INSERT INTO payroll_pto_ledger
       (agency_id, user_id, entry_type, pto_bucket, hours_delta, effective_date, payroll_period_id, request_id, note, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        userId,
        entryType,
        ptoBucket,
        hoursDelta,
        effectiveDate,
        payrollPeriodId,
        requestId,
        note,
        createdByUserId
      ]
    );
    return res?.insertId || null;
  }

  static async listForAgencyUser({ agencyId, userId, limit = 200 }) {
    const lim = Math.max(1, Math.min(500, Number(limit || 200)));
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_pto_ledger
       WHERE agency_id = ? AND user_id = ?
       ORDER BY effective_date DESC, id DESC
       LIMIT ${lim}`,
      [agencyId, userId]
    );
    return rows || [];
  }
}

export default PayrollPtoLedger;

