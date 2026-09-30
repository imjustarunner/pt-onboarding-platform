import { beginClientSubmission } from './officeClientSubmissions.service.js';
import pool from '../config/database.js';
import NotificationDispatcher from './notificationDispatcher.service.js';
import { isNotificationChannelEnabled } from './notificationPreferences.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { officeTodayUtcBounds, parseUtcDate } from '../utils/officeEventDateTime.util.js';

function reject(status, message) {
  return Object.assign(new Error(message), { status });
}

// Lock the event so simultaneous taps create exactly one arrival and one inbox alert.
// The inbox alert and arrival commit together: a successful check-in always has an alert.
export async function recordOfficeKioskCheckin({ locationId, eventId, providerId, submissionKey, respondentType }) {
  const conn = await pool.getConnection();
  let notification;
  let submission;
  let recipient;
  let alreadyCheckedIn = false;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT e.id, e.office_location_id, e.room_id, e.booked_provider_id, e.status, e.slot_state,
              e.start_at, e.end_at, e.client_id, e.clinical_session_id, ol.name AS location_name, ol.timezone, ol.agency_id,
              r.name AS room_name, r.room_number, u.email, u.work_email, u.role
       FROM office_events e
       JOIN office_locations ol ON ol.id = e.office_location_id AND ol.is_active = 1
       JOIN office_rooms r ON r.id = e.room_id AND r.is_active = 1
       JOIN users u ON u.id = e.booked_provider_id AND u.is_active = 1
         AND u.status = 'ACTIVE_EMPLOYEE' AND u.terminated_at IS NULL
       WHERE e.id = ? AND e.office_location_id = ? FOR UPDATE`, [eventId, locationId]);
    const event = rows[0];
    if (!event) throw reject(404, 'Appointment not found at this office. Please select your provider again.');
    if (providerId && Number(event.booked_provider_id) !== providerId) {
      throw reject(409, 'This appointment has changed. Please select your provider again.');
    }
    if (event.status === 'CANCELLED' || !(event.status === 'BOOKED' || event.slot_state === 'ASSIGNED_BOOKED')) {
      throw reject(409, 'This appointment is no longer available for check-in. Please ask staff for help.');
    }
    const timezone = event.timezone || 'America/Denver';
    const bounds = officeTodayUtcBounds(timezone);
    if (!(parseUtcDate(event.start_at) < parseUtcDate(bounds.endExclusive)
      && parseUtcDate(event.end_at) > parseUtcDate(bounds.startAt))) {
      throw reject(409, 'Check-in is available only for today’s appointments.');
    }
    const [existing] = await conn.execute('SELECT id FROM office_event_checkins WHERE event_id = ?', [eventId]);
    let checkinId = existing[0]?.id;
    alreadyCheckedIn = !!checkinId;
    if (!checkinId) {
      const [insert] = await conn.execute(
        `INSERT INTO office_event_checkins (event_id, office_location_id, room_id, provider_id)
         VALUES (?, ?, ?, ?)`, [eventId, locationId, event.room_id, event.booked_provider_id]);
      checkinId = insert.insertId;
    }
    const [alerts] = await conn.execute(
      `SELECT id, agency_id FROM notifications WHERE type = 'kiosk_checkin' AND user_id = ?
       AND related_entity_type = 'office_event_checkin' AND related_entity_id = ? LIMIT 1`,
      [event.booked_provider_id, checkinId]);
    if (!alerts.length) {
      // Resolve membership at this office, never an unrelated first agency on the user.
      const [agencies] = await conn.execute(
        `SELECT ua.agency_id FROM user_agencies ua
         WHERE ua.user_id = ? AND ua.is_active = 1
           AND (ua.agency_id = ? OR EXISTS (SELECT 1 FROM office_location_agencies ola
                WHERE ola.office_location_id = ? AND ola.agency_id = ua.agency_id))
         ORDER BY (ua.agency_id = ?) DESC, ua.agency_id LIMIT 1`,
        [event.booked_provider_id, event.agency_id, locationId, event.agency_id]);
      const agencyId = agencies[0]?.agency_id;
      if (!agencyId) throw reject(409, 'Your provider’s office setup needs attention. Please ask staff to check you in.');
      const time = parseUtcDate(event.start_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: timezone, timeZoneName: 'short'
      });
      const room = event.room_number ? `Office ${event.room_number}` : event.room_name;
      const message = `Your ${time} appointment has checked in at ${event.location_name}, ${room}. Your client is waiting in the lobby.${submissionKey ? ' Review this arrival in Clients → Check-in submissions.' : ''}`;
      const [insert] = await conn.execute(
        `INSERT INTO notifications (type, severity, title, message, user_id, agency_id,
          related_entity_type, related_entity_id, actor_source)
         VALUES ('kiosk_checkin', 'info', 'Your client has arrived', ?, ?, ?, 'office_event_checkin', ?, 'Kiosk')`,
        [message, event.booked_provider_id, agencyId, checkinId]);
      notification = { id: insert.insertId, type: 'kiosk_checkin', severity: 'info',
        title: 'Your client has arrived', message, user_id: event.booked_provider_id, agency_id: agencyId };
      recipient = event;
    }
    if (submissionKey) {
      const agencyId = notification?.agency_id || alerts[0]?.agency_id;
      if (!agencyId) throw reject(409,'Your provider’s office setup needs attention.');
      submission = await beginClientSubmission(conn,event,Number(agencyId),submissionKey,respondentType);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  // Additional channels cannot undo the saved arrival and inbox notification.
  let email = 'not_requested';
  if (notification) {
    await Promise.allSettled([
      NotificationDispatcher.dispatchForNotification(notification),
      NotificationDispatcher.dispatchPushForNotification(notification)
    ]);
    try {
      const enabled = await isNotificationChannelEnabled({ userId: notification.user_id,
        userRole: recipient.role, agencyId: notification.agency_id, type: 'kiosk_checkin', channel: 'email' });
      if (enabled) {
        const sender = await resolvePreferredSenderIdentityForAgency({ agencyId: notification.agency_id,
          preferredKeys: ['notifications', 'system'], includePlatformDefaults: false, onlyActive: true });
        const to = recipient.work_email || recipient.email;
        if (sender?.id && to) {
          const result = await sendEmailFromIdentity({ senderIdentityId: sender.id, to,
            subject: notification.title, text: notification.message, userId: notification.user_id,
            templateType: 'kiosk_checkin', source: 'auto' });
          email = result?.skipped ? 'skipped' : result?.pendingApproval ? 'pending' : 'submitted';
        } else email = 'unavailable';
      }
    } catch (error) {
      email = 'failed';
      console.warn('[office-kiosk] Optional email failed:', error?.code || 'delivery_error');
    }
  }
  return { ok: true, eventId, alreadyCheckedIn, ...(submission ? {submission} : {}), notification: { inApp: true, email } };
}
