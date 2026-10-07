import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';
import NotificationDispatcher from './notificationDispatcher.service.js';
import { isUserAvailable } from './availabilityWindow.service.js';
import VacationScheduleSyncService from './vacationScheduleSync.service.js';

// Keep a durable ticket until a human handles it. Delivery/read receipts are not claims.
// Lock across replicas, but never hold a transaction while contacting a carrier.
export async function alertRequestedSupport(offerId) {
  const db = await pool.getConnection();
  const lock = `sms-support-alert:${Number(offerId)}`;
  let locked = false;
  try {
    const [locks] = await db.execute('SELECT GET_LOCK(?, 0) AS acquired', [lock]);
    locked = Number(locks[0]?.acquired) === 1;
    if (!locked) return;
    const [rows] = await db.execute(`SELECT ml.id, ml.agency_id, t.id AS ticket_id,
        t.status, t.claimed_by_user_id,
        (JSON_EXTRACT(ml.metadata, '$.supportAlertAttemptAt') IS NULL OR
         CAST(JSON_UNQUOTE(JSON_EXTRACT(ml.metadata, '$.supportAlertAttemptAt')) AS DATETIME)
           <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)) AS alert_due
      FROM message_logs ml JOIN support_tickets t
        ON t.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(ml.metadata, '$.supportChoiceTicketId')) AS UNSIGNED)
        AND t.agency_id = ml.agency_id
      WHERE ml.id = ? AND JSON_EXTRACT(ml.metadata, '$.supportChoiceOffer') = true`, [offerId]);
    const row = rows[0];
    if (!row || row.status !== 'open' || row.claimed_by_user_id || !Number(row.alert_due)) return;
    await db.execute(`UPDATE message_logs SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()),
      '$.supportAlertCheckedAt', UTC_TIMESTAMP()) WHERE id = ?`, [offerId]);
    const [staff] = await db.execute(`SELECT DISTINCT u.id, u.role FROM users u
      JOIN user_agencies ua ON ua.user_id = u.id
      WHERE ua.agency_id = ? AND ua.is_active = TRUE AND u.is_active = TRUE
        AND u.terminated_at IS NULL AND COALESCE(u.is_archived, FALSE) = FALSE
        AND COALESCE(u.status, '') NOT IN ('TERMINATED_PENDING','ARCHIVED','INACTIVE_EMPLOYEE')
        AND u.role IN ('support','clinical_practice_assistant','admin','super_admin')`, [row.agency_id]);
    const available = [];
    for (const user of staff) {
      if (await VacationScheduleSyncService.isUserOnVacation(user.id, row.agency_id)) continue;
      if ((await isUserAvailable(user.id, new Date(), { agencyId: row.agency_id })).available) available.push(user);
    }
    const isSupport = user => ['support', 'clinical_practice_assistant'].includes(user.role);
    const support = available.filter(isSupport);
    const availableRecipients = support.length ? support : available;
    // If nobody is available, leave in-app notices for admins (or support if no admin).
    // The minute worker will retry availability; do not send off-hours SMS/push.
    const admins = staff.filter(user => !isSupport(user));
    const recipients = availableRecipients.length ? availableRecipients : (admins.length ? admins : staff);
    let failed = false;
    for (const user of recipients) {
      try {
        const [prior] = await db.execute(`SELECT * FROM notifications WHERE agency_id = ? AND user_id = ?
          AND type = 'support_safety_net_alert' AND related_entity_type = 'support_ticket'
          AND related_entity_id = ? ORDER BY id DESC LIMIT 1`, [row.agency_id, user.id, row.ticket_id]);
        const notice = (prior[0] && !prior[0].is_resolved ? prior[0] : null) || await Notification.create({
          type: 'support_safety_net_alert', severity: 'urgent',
          title: 'Urgent support request needs an owner',
          message: 'A client requested support while their providers are unavailable. Open and claim the ticket, reply in the secure app, then close the ticket when handled.',
          userId: user.id, agencyId: row.agency_id,
          relatedEntityType: 'support_ticket', relatedEntityId: row.ticket_id,
          actorSource: 'sms_support_request'
        });
        if (availableRecipients.length) {
          // A reminder must also surface in-app for staff who disabled SMS/push.
          await Notification.setViewerState(notice.id, user.id, { read: false, dismissed: false, snoozedUntil: null });
          // One channel failing must not prevent the other channel or next recipient.
          await Promise.allSettled([
            NotificationDispatcher.dispatchForNotification(notice, { context: { isUrgent: true } }),
            NotificationDispatcher.dispatchPushForNotification(notice)
          ]);
        }
      } catch (error) {
        failed = true;
        console.warn('[smsSupportRequest] Recipient alert pending:', error.code || 'alert_failed');
      }
    }
    if (availableRecipients.length && !failed) {
      await db.execute(`UPDATE message_logs SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()),
        '$.supportAlertAttemptAt', UTC_TIMESTAMP()) WHERE id = ?`, [offerId]);
    }
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { db.release(); }
  }
}

export async function retryRequestedSupportAlerts() {
  const [rows] = await pool.execute(`SELECT ml.id FROM message_logs ml JOIN support_tickets t
      ON t.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(ml.metadata, '$.supportChoiceTicketId')) AS UNSIGNED)
      AND t.agency_id = ml.agency_id
    WHERE ml.direction = 'OUTBOUND' AND JSON_EXTRACT(ml.metadata, '$.supportChoiceOffer') = true
      AND t.status = 'open' AND t.claimed_by_user_id IS NULL
      AND (JSON_EXTRACT(ml.metadata, '$.supportAlertAttemptAt') IS NULL OR
        CAST(JSON_UNQUOTE(JSON_EXTRACT(ml.metadata, '$.supportAlertAttemptAt')) AS DATETIME)
          <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))
    ORDER BY JSON_UNQUOTE(JSON_EXTRACT(ml.metadata, '$.supportAlertCheckedAt')), ml.id LIMIT 100`);
  for (const row of rows) {
    await alertRequestedSupport(row.id).catch(error => console.warn('[smsSupportRequest] Retry pending:', error.code || 'alert_failed'));
  }
}
