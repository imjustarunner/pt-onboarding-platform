import pool from '../config/database.js';
import GoogleCalendarService from './googleCalendar.service.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';

/**
 * Auto-cancel empty agency-signup group sessions after signup closes.
 * signup_closes_at is stored as UTC DATETIME (migration 1097).
 */
export async function runSupervisionSignupAutoCancelTick() {
  let rows = [];
  try {
    const [result] = await pool.execute(
      `SELECT ss.id,
              DATE_FORMAT(ss.signup_closes_at, '%Y-%m-%d %H:%i:%s') AS signup_closes_at,
              ss.google_event_id,
              ss.google_calendar_id,
              ss.google_host_email
       FROM supervision_sessions ss
       WHERE LOWER(COALESCE(ss.enrollment_mode, 'invited')) = 'signup_only'
         AND UPPER(COALESCE(ss.status, 'SCHEDULED')) = 'SCHEDULED'
         AND COALESCE(ss.auto_cancel_if_empty, 0) = 1
         AND ss.signup_closes_at IS NOT NULL
         AND ss.signup_closes_at <= UTC_TIMESTAMP()
         AND NOT EXISTS (
           SELECT 1
           FROM supervision_session_attendees ssa
           WHERE ssa.session_id = ss.id
             AND ssa.participant_role = 'supervisee'
             AND UPPER(COALESCE(ssa.status, '')) IN ('SIGNED_UP', 'JOINED', 'INVITED')
         )`
    );
    rows = result || [];
  } catch (e) {
    if (!/enrollment_mode|signup_closes_at|auto_cancel_if_empty/i.test(String(e?.message || ''))) {
      throw e;
    }
    console.warn('[supervision-signup-auto-cancel] skipped tick:', e?.message || e);
    return { cancelled: 0, skipped: true };
  }

  let cancelled = 0;
  for (const row of rows || []) {
    const sid = Number(row?.id || 0);
    if (!sid) continue;
    // Defensive: ensure close instant is parseable as UTC
    if (!utcMysqlToIso(row?.signup_closes_at)) continue;
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
