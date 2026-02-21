import pool from '../config/database.js';
import NotificationEvent from '../models/NotificationEvent.model.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';

export class OfficeScheduleReviewService {
  static async listProvidersNeedingBiweeklyReview({ agencyId }) {
    // Providers who:
    // - belong to agency
    // - have at least one active standing assignment in an office assigned to agency
    const [rows] = await pool.execute(
      `SELECT DISTINCT osa.provider_id AS user_id
       FROM office_standing_assignments osa
       JOIN office_location_agencies ola ON ola.office_location_id = osa.office_location_id AND ola.agency_id = ?
       JOIN user_agencies ua ON ua.user_id = osa.provider_id AND ua.agency_id = ?
       WHERE osa.is_active = TRUE`,
      [agencyId, agencyId]
    );
    return (rows || []).map((r) => Number(r.user_id)).filter((n) => Number.isInteger(n) && n > 0);
  }

  static async emitBiweeklyReviewNotifications({ agencyId, payrollPeriodId, postedByUserId }) {
    const providers = await this.listProvidersNeedingBiweeklyReview({ agencyId });
    let sent = 0;
    for (const userId of providers) {
      // Dedupe per posted payroll period + recipient
      const ok = await NotificationEvent.tryCreate({
        agencyId,
        triggerKey: 'office_schedule_biweekly_review',
        payrollPeriodId,
        providerUserId: userId,
        recipientUserId: userId
      });
      if (!ok) continue;

      try {
        await createNotificationAndDispatch({
          type: 'office_schedule_biweekly_review',
          severity: 'info',
          title: 'Office schedule review',
          message: 'Payroll has been posted. Please review your office reservations for the next two weeks.',
          userId,
          agencyId,
          relatedEntityType: 'payroll_period',
          relatedEntityId: payrollPeriodId,
          actorSource: 'Office Scheduling'
        });
        sent += 1;
      } catch {
        // If notification dispatch fails, keep the dedupe event to avoid spamming.
      }
    }
    return { ok: true, providers: providers.length, notificationsSent: sent };
  }
}

