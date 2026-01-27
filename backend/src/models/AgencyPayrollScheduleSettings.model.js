import pool from '../config/database.js';

class AgencyPayrollScheduleSettings {
  static async getForAgency(agencyId) {
    if (!agencyId) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_payroll_schedule_settings
       WHERE agency_id = ?
       LIMIT 1`,
      [agencyId]
    );
    return rows?.[0] || null;
  }

  static async upsert({
    agencyId,
    scheduleType,
    biweeklyAnchorPeriodEnd,
    semiMonthlyDay1,
    semiMonthlyDay2,
    futureDraftCount,
    updatedByUserId
  }) {
    await pool.execute(
      `INSERT INTO agency_payroll_schedule_settings
        (agency_id, schedule_type, biweekly_anchor_period_end, semi_monthly_day1, semi_monthly_day2, future_draft_count, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         schedule_type = VALUES(schedule_type),
         biweekly_anchor_period_end = VALUES(biweekly_anchor_period_end),
         semi_monthly_day1 = VALUES(semi_monthly_day1),
         semi_monthly_day2 = VALUES(semi_monthly_day2),
         future_draft_count = VALUES(future_draft_count),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        scheduleType,
        biweeklyAnchorPeriodEnd ? String(biweeklyAnchorPeriodEnd).slice(0, 10) : null,
        semiMonthlyDay1,
        semiMonthlyDay2,
        futureDraftCount,
        updatedByUserId || null
      ]
    );
    return this.getForAgency(agencyId);
  }
}

export default AgencyPayrollScheduleSettings;

