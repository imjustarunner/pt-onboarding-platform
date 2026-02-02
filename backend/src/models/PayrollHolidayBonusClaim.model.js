import pool from '../config/database.js';

class PayrollHolidayBonusClaim {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_holiday_bonus_claims
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async findForAgencyUserPeriod({ agencyId, userId, payrollPeriodId }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_holiday_bonus_claims
       WHERE agency_id = ?
         AND user_id = ?
         AND payroll_period_id = ?
       LIMIT 1`,
      [agencyId, userId, payrollPeriodId]
    );
    return rows?.[0] || null;
  }

  static async upsertSubmittedComputed({
    agencyId,
    userId,
    payrollPeriodId,
    holidayBonusPercent,
    baseServicePayAmount,
    appliedAmount,
    holidayDatesJson
  }) {
    await pool.execute(
      `INSERT INTO payroll_holiday_bonus_claims
       (agency_id, user_id, payroll_period_id, status, holiday_bonus_percent, base_service_pay_amount, applied_amount, holiday_dates_json)
       VALUES
       (?, ?, ?, 'submitted', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         holiday_bonus_percent = IF(status = 'submitted', VALUES(holiday_bonus_percent), holiday_bonus_percent),
         base_service_pay_amount = IF(status = 'submitted', VALUES(base_service_pay_amount), base_service_pay_amount),
         applied_amount = IF(status = 'submitted', VALUES(applied_amount), applied_amount),
         holiday_dates_json = IF(status = 'submitted', VALUES(holiday_dates_json), holiday_dates_json),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        userId,
        payrollPeriodId,
        Number(holidayBonusPercent || 0),
        Number(baseServicePayAmount || 0),
        Number(appliedAmount || 0),
        holidayDatesJson ? JSON.stringify(holidayDatesJson) : null
      ]
    );
    return PayrollHolidayBonusClaim.findForAgencyUserPeriod({ agencyId, userId, payrollPeriodId });
  }

  static async deleteSubmittedForPeriodUser({ agencyId, userId, payrollPeriodId }) {
    const [result] = await pool.execute(
      `DELETE FROM payroll_holiday_bonus_claims
       WHERE agency_id = ?
         AND user_id = ?
         AND payroll_period_id = ?
         AND status = 'submitted'`,
      [agencyId, userId, payrollPeriodId]
    );
    return result?.affectedRows || 0;
  }

  static async deleteAllSubmittedForPeriod({ agencyId, payrollPeriodId }) {
    const [result] = await pool.execute(
      `DELETE FROM payroll_holiday_bonus_claims
       WHERE agency_id = ?
         AND payroll_period_id = ?
         AND status = 'submitted'`,
      [agencyId, payrollPeriodId]
    );
    return result?.affectedRows || 0;
  }

  static async listForAgency({
    agencyId,
    payrollPeriodId = null,
    status = null,
    userId = null,
    limit = 500,
    offset = 0
  }) {
    const lim = Math.max(1, Math.min(1000, Number(limit || 500)));
    const off = Math.max(0, Number(offset || 0));

    const params = [agencyId];
    const conds = ['c.agency_id = ?'];
    if (Number.isFinite(Number(payrollPeriodId)) && Number(payrollPeriodId) > 0) {
      conds.push('c.payroll_period_id = ?');
      params.push(Number(payrollPeriodId));
    }
    if (status) {
      conds.push('c.status = ?');
      params.push(String(status));
    }
    if (Number.isFinite(Number(userId)) && Number(userId) > 0) {
      conds.push('c.user_id = ?');
      params.push(Number(userId));
    }

    const [rows] = await pool.execute(
      `SELECT c.*,
              u.first_name,
              u.last_name,
              u.email
       FROM payroll_holiday_bonus_claims c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE ${conds.join(' AND ')}
       ORDER BY c.status ASC, c.payroll_period_id DESC, u.last_name ASC, u.first_name ASC, c.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows || [];
  }

  static async sumApprovedForPeriodUser({ payrollPeriodId, agencyId, userId }) {
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(applied_amount), 0) AS amt
       FROM payroll_holiday_bonus_claims
       WHERE agency_id = ?
         AND payroll_period_id = ?
         AND user_id = ?
         AND status = 'approved'`,
      [agencyId, payrollPeriodId, userId]
    );
    return Number(rows?.[0]?.amt || 0);
  }

  static async approve({ id, approverUserId }) {
    await pool.execute(
      `UPDATE payroll_holiday_bonus_claims
       SET status = 'approved',
           approved_by_user_id = ?,
           approved_at = NOW(),
           rejection_reason = NULL,
           rejected_by_user_id = NULL,
           rejected_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [approverUserId, id]
    );
    return PayrollHolidayBonusClaim.findById(id);
  }

  static async reject({ id, rejectorUserId, rejectionReason }) {
    await pool.execute(
      `UPDATE payroll_holiday_bonus_claims
       SET status = 'rejected',
           rejection_reason = ?,
           rejected_by_user_id = ?,
           rejected_at = NOW()
       WHERE id = ?
       LIMIT 1`,
      [rejectionReason || null, rejectorUserId, id]
    );
    return PayrollHolidayBonusClaim.findById(id);
  }

  static async unapprove({ id }) {
    await pool.execute(
      `UPDATE payroll_holiday_bonus_claims
       SET status = 'submitted',
           approved_by_user_id = NULL,
           approved_at = NULL,
           rejection_reason = NULL,
           rejected_by_user_id = NULL,
           rejected_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return PayrollHolidayBonusClaim.findById(id);
  }
}

export default PayrollHolidayBonusClaim;

