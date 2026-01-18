import pool from '../config/database.js';

class NotificationEvent {
  /**
   * Insert a dedupe event record; returns true if inserted, false if already exists.
   */
  static async tryCreate({
    agencyId,
    triggerKey,
    payrollPeriodId = null,
    providerUserId = null,
    stalePeriodId = null,
    recipientUserId = null
  }) {
    try {
      await pool.execute(
        `INSERT INTO notification_events
          (agency_id, trigger_key, payroll_period_id, provider_user_id, stale_period_id, recipient_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [agencyId, triggerKey, payrollPeriodId, providerUserId, stalePeriodId, recipientUserId]
      );
      return true;
    } catch (e) {
      // MySQL duplicate key
      if (e?.code === 'ER_DUP_ENTRY') return false;
      throw e;
    }
  }

  static async exists({
    agencyId,
    triggerKey,
    payrollPeriodId = null,
    providerUserId = null,
    stalePeriodId = null,
    recipientUserId = null
  }) {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM notification_events
       WHERE agency_id = ?
         AND trigger_key = ?
         AND payroll_period_id <=> ?
         AND provider_user_id <=> ?
         AND stale_period_id <=> ?
         AND recipient_user_id <=> ?
       LIMIT 1`,
      [agencyId, triggerKey, payrollPeriodId, providerUserId, stalePeriodId, recipientUserId]
    );
    return (rows || []).length > 0;
  }
}

export default NotificationEvent;

