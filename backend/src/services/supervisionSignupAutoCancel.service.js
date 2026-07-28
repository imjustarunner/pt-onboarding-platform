import pool from '../config/database.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import GoogleCalendarService from './googleCalendar.service.js';

export async function runSupervisionSignupAutoCancelTick({ now = new Date() } = {}) {
  let rows = [];
  try {
    const [result] = await pool.execute(
      `SELECT ss.id, ss.google_event_id, ss.google_calendar_id, ss.google_host_email
       FROM supervision_sessions ss
       WHERE LOWER(COALESCE(ss.enrollment_mode, 'invited')) = 'signup_only'
         AND UPPER(COALESCE(ss.status, 'SCHEDULED')) = 'SCHEDULED'
         AND COALESCE(ss.auto_cancel_if_empty, 0) = 1
         AND ss.signup_closes_at IS NOT NULL
         AND ss.signup_closes_at <= ?
         AND NOT EXISTS (
           SELECT 1
           FROM supervision_session_attendees ssa
           WHERE ssa.session_id = ss.id
             AND ssa.participant_role = 'supervisee'
             AND UPPER(COALESCE(ssa.status, '')) IN ('SIGNED_UP', 'JOINED', 'INVITED')
         )`,
      [now]
    );
    rows = result || [];
  } catch (e) {
    if (!/enrollment_mode|signup_closes_at|auto_cancel_if_empty/i.test(String(e?.message || ''))) {
      throw e;
    }
    return { cancelled: 0 };
  }

  let cancelled = 0;
  for (const row of rows || []) {
    const sid = Number(row?.id || 0);
    if (!sid) continue;
    try {
      await pool.execute(
        `UPDATE supervision_sessions
         SET status = 'CANCELLED',
             cancel_reason = 'NO_SIGNUPS',
             auto_cancelled_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND UPPER(COALESCE(status, 'SCHEDULED')) = 'SCHEDULED'`,
        [sid]
      );
      cancelled += 1;
      const eventId = String(row?.google_event_id || '').trim();
      const calendarId = String(row?.google_calendar_id || 'primary').trim() || 'primary';
      const hostEmail = String(row?.google_host_email || '').trim();
      if (eventId && hostEmail) {
        try {
          await GoogleCalendarService.deleteEvent({ hostEmail, calendarId, eventId });
        } catch {
          /* best effort */
        }
      }
    } catch (err) {
      console.warn('[supervision-signup-auto-cancel] failed', sid, err?.message || err);
    }
  }
  return { cancelled };
}
