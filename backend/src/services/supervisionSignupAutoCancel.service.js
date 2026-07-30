import pool from '../config/database.js';
import GoogleCalendarService from './googleCalendar.service.js';

const DEFAULT_AGENCY_TZ = 'America/Denver';

/**
 * Current wall-clock time as MySQL DATETIME in an IANA timezone.
 * Session times / signup_closes_at are stored as naive agency-local DATETIMEs.
 */
function wallNowMysql(timeZone = DEFAULT_AGENCY_TZ) {
  const tz = String(timeZone || DEFAULT_AGENCY_TZ).trim() || DEFAULT_AGENCY_TZ;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value || '00';
    let hour = get('hour');
    // Some runtimes emit "24" for midnight.
    if (hour === '24') hour = '00';
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
  } catch {
    const d = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  }
}

function closesAtMysql(value) {
  if (!value) return '';
  // Prefer DATE_FORMAT strings from SQL; avoid Date objects (driver TZ ambiguity).
  const raw = String(value).trim().replace('T', ' ');
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ ](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  return raw.slice(0, 19);
}

/**
 * Auto-cancel empty agency-signup group sessions after signup closes.
 *
 * Comparing signup_closes_at to UTC NOW() cancelled evening Mountain/Pacific sessions
 * as soon as the UTC clock passed the wall-clock close hour. Compare wall clocks instead.
 */
export async function runSupervisionSignupAutoCancelTick() {
  let rows = [];
  try {
    const [result] = await pool.execute(
      `SELECT ss.id,
              DATE_FORMAT(ss.signup_closes_at, '%Y-%m-%d %H:%i:%s') AS signup_closes_at,
              ss.google_event_id,
              ss.google_calendar_id,
              ss.google_host_email,
              COALESCE(NULLIF(TRIM(a.timezone), ''), ?) AS agency_timezone
       FROM supervision_sessions ss
       LEFT JOIN agencies a ON a.id = ss.agency_id
       WHERE LOWER(COALESCE(ss.enrollment_mode, 'invited')) = 'signup_only'
         AND UPPER(COALESCE(ss.status, 'SCHEDULED')) = 'SCHEDULED'
         AND COALESCE(ss.auto_cancel_if_empty, 0) = 1
         AND ss.signup_closes_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM supervision_session_attendees ssa
           WHERE ssa.session_id = ss.id
             AND ssa.participant_role = 'supervisee'
             AND UPPER(COALESCE(ssa.status, '')) IN ('SIGNED_UP', 'JOINED', 'INVITED')
         )`,
      [DEFAULT_AGENCY_TZ]
    );
    rows = result || [];
  } catch (e) {
    if (!/enrollment_mode|signup_closes_at|auto_cancel_if_empty|timezone/i.test(String(e?.message || ''))) {
      throw e;
    }
    console.warn('[supervision-signup-auto-cancel] skipped tick:', e?.message || e);
    return { cancelled: 0, skipped: true };
  }

  let cancelled = 0;
  for (const row of rows || []) {
    const sid = Number(row?.id || 0);
    if (!sid) continue;
    const closesAt = closesAtMysql(row?.signup_closes_at);
    const nowWall = wallNowMysql(row?.agency_timezone || DEFAULT_AGENCY_TZ);
    if (!closesAt || closesAt > nowWall) continue;
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
