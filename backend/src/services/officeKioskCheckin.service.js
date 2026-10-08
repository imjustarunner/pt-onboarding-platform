import { beginClientSubmission, submissionTokenHash } from './officeClientSubmissions.service.js';
import pool from '../config/database.js';
import NotificationDispatcher from './notificationDispatcher.service.js';
import { lobbySlot } from '../utils/officeLobbyWindow.js';
import { officeTodayUtcBounds, parseUtcDate } from '../utils/officeEventDateTime.util.js';

function reject(status, message) {
  return Object.assign(new Error(message), { status });
}

// Lock the event so simultaneous taps create exactly one arrival and one inbox alert.
// The inbox alert and arrival commit together: a successful check-in always has an alert.
export async function recordOfficeKioskCheckin({ locationId, eventId, providerId, submissionKey, respondentType, serviceType, appointmentStartAt, nextHour=false }) {
  const conn = await pool.getConnection();
  let notification;
  let submission;
  let alreadyCheckedIn = false;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT e.id, e.office_location_id, e.room_id, (CASE WHEN e.status='BOOKED' OR e.slot_state='ASSIGNED_BOOKED' THEN COALESCE(e.booked_provider_id,e.assigned_provider_id) ELSE e.assigned_provider_id END) AS booked_provider_id, e.status, e.slot_state,
              e.start_at, e.end_at, e.client_id, e.clinical_session_id, ol.name AS location_name, ol.timezone, ol.agency_id,
              r.name AS room_name, r.room_number, u.email, u.work_email, u.role
       FROM office_events e
       JOIN office_locations ol ON ol.id = e.office_location_id AND ol.is_active = 1
       JOIN office_rooms r ON r.id = e.room_id AND r.is_active = 1
       JOIN users u ON u.id = (CASE WHEN e.status='BOOKED' OR e.slot_state='ASSIGNED_BOOKED' THEN COALESCE(e.booked_provider_id,e.assigned_provider_id) ELSE e.assigned_provider_id END) AND u.is_active = 1
         AND u.status = 'ACTIVE_EMPLOYEE' AND u.terminated_at IS NULL
       WHERE e.id = ? AND e.office_location_id = ? FOR UPDATE`, [eventId, locationId]);
    const event = rows[0];
    if (!event) throw reject(404, 'Appointment not found at this office. Please select your provider again.');
    if (providerId && Number(event.booked_provider_id) !== providerId) {
      throw reject(409, 'This appointment has changed. Please select your provider again.');
    }
    if (event.status === 'CANCELLED' || event.slot_state === 'COMPANY_HOLD' || !event.booked_provider_id) {
      throw reject(409, 'This appointment is no longer available for check-in. Please ask staff for help.');
    }
    const timezone = event.timezone || 'America/Denver';
    const bounds = officeTodayUtcBounds(timezone);
    if (!(parseUtcDate(event.start_at) < parseUtcDate(bounds.endExclusive)
      && parseUtcDate(event.end_at) > parseUtcDate(bounds.startAt))) {
      throw reject(409, 'Check-in is available only for today’s appointments.');
    }
    const slot=lobbySlot(event,{nextHour,timezone});
    if(!slot || (appointmentStartAt && appointmentStartAt!==slot.appointmentStartAt)) throw reject(409,'This appointment window has changed. Please select your provider again.');
    // Preserve one arrival per displayed hour, even for a multi-hour office allocation.
    const originalStart=parseUtcDate(event.start_at).toISOString().slice(0,19).replace('T',' ');
    event.start_at=parseUtcDate(slot.appointmentStartAt);
    if(!event.client_id&&!event.clinical_session_id) event.end_at=new Date(Math.min(parseUtcDate(event.end_at).getTime(),event.start_at.getTime()+3600000));
    const slotStart=event.start_at.toISOString().slice(0,19).replace('T',' ');
    // During a rolling release an older instance can still write a null slot.
    // Adopt that arrival only for its original appointment, never a later hour.
    await conn.execute('UPDATE office_event_checkins SET slot_start_at = ? WHERE event_id = ? AND slot_start_at IS NULL',[originalStart,eventId]);
    const [existing] = await conn.execute('SELECT id FROM office_event_checkins WHERE office_location_id = ? AND provider_id = ? AND slot_start_at = ?', [locationId,event.booked_provider_id,slotStart]);
    let checkinId = existing[0]?.id;
    alreadyCheckedIn = !!checkinId;
    if (!checkinId) {
      const [insert] = await conn.execute(
        `INSERT INTO office_event_checkins (event_id, office_location_id, room_id, provider_id,slot_start_at)
         VALUES (?, ?, ?, ?,?)`, [eventId, locationId, event.room_id, event.booked_provider_id,slotStart]);
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
      const message = `Your ${time} appointment has checked in at ${event.location_name}, ${room}. Your client is waiting in the lobby.${submissionKey ? ' Review this arrival in Clients → Recurring check-ins.' : ''}`;
      const [insert] = await conn.execute(
        `INSERT INTO notifications (type, severity, title, message, user_id, agency_id,
          related_entity_type, related_entity_id, actor_source)
         VALUES ('kiosk_checkin', 'info', 'Your client has arrived', ?, ?, ?, 'office_event_checkin', ?, 'Kiosk')`,
        [message, event.booked_provider_id, agencyId, checkinId]);
      notification = { id: insert.insertId, type: 'kiosk_checkin', severity: 'info',
        title: 'Your client has arrived', message, user_id: event.booked_provider_id, agency_id: agencyId };
      await conn.execute(
        `INSERT INTO office_arrival_deliveries (notification_id, user_id, agency_id, due_at)
         VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 90 SECOND))`,
        [notification.id, notification.user_id, notification.agency_id]);
    }
    let resumeOwnReceipt = false;
    if (submissionKey && alreadyCheckedIn) {
      const [receipts] = await conn.execute('SELECT id FROM office_client_checkin_submissions WHERE token_hash=? AND event_id=? AND scheduled_start_at=?', [submissionTokenHash(submissionKey),eventId,slotStart]);
      resumeOwnReceipt = receipts.length > 0;
    }
    // A new browser cannot create another questionnaire receipt for an arrival
    // that already exists. Only the original opaque receipt can be resumed.
    if (submissionKey && (!alreadyCheckedIn || resumeOwnReceipt)) {
      const agencyId = notification?.agency_id || alerts[0]?.agency_id;
      if (!agencyId) throw reject(409,'Your provider’s office setup needs attention.');
      submission = await beginClientSubmission(conn,event,Number(agencyId),submissionKey,respondentType,serviceType);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  // The durable fallback waits 90 seconds for acknowledgment. Push stays opt-in.
  if (notification) await Promise.allSettled([NotificationDispatcher.dispatchPushForNotification(notification),NotificationDispatcher.dispatchForNotification(notification)]);
  const email = notification ? 'queued' : 'not_requested';
  return { ok: true, eventId, alreadyCheckedIn, ...(submission ? {submission} : {}), notification: { inApp: true, email } };
}
