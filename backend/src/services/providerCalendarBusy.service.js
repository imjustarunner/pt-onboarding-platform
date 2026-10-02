import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';

const instant = value => value instanceof Date ? value : new Date(String(value).replace(' ', 'T').replace(/Z?$/, 'Z'));
const mysql = value => instant(value).toISOString().slice(0, 19).replace('T', ' ');
const ymd = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

// App time remains unavailable even if Google synchronization is disabled or fails.
// Query every agency and attendee calendar, but never expose private titles or notes.
export async function readProviderCalendarBusy(db, { providerId, startAt, endAt, timeZone = 'America/Denver', excludeEventId = null }) {
  const from = instant(startAt), to = instant(endAt);
  const [rows] = await db.execute(`SELECT p.id, p.all_day, p.start_at, p.end_at, p.start_date, p.end_date, p.event_timezone
    FROM provider_schedule_events p
    WHERE (p.provider_id = ? OR EXISTS (SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id = p.id AND a.user_id = ?))
      AND p.status = 'ACTIVE' AND (? IS NULL OR p.id <> ?)
      AND ((COALESCE(p.all_day, 0) = 0 AND p.start_at < ? AND p.end_at > ?)
        OR (p.all_day = 1 AND p.start_date <= ? AND COALESCE(p.end_date, DATE_ADD(p.start_date, INTERVAL 1 DAY)) >= ?))`,
    [Number(providerId), Number(providerId), excludeEventId, excludeEventId, mysql(to), mysql(from),
      new Date(+to + 86400000).toISOString().slice(0, 10), new Date(+from - 86400000).toISOString().slice(0, 10)]);
  return rows.flatMap(row => {
    let start, end;
    if (Number(row.all_day)) {
      const startDate = ymd(row.start_date);
      const endDate = row.end_date ? ymd(row.end_date) : new Date(Date.parse(`${startDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
      start = instant(wallMysqlToUtcMysql(`${startDate} 00:00:00`, row.event_timezone || timeZone));
      end = instant(wallMysqlToUtcMysql(`${endDate} 00:00:00`, row.event_timezone || timeZone));
    } else { start = instant(row.start_at); end = instant(row.end_at); }
    return start < to && end > from && end > start ? [{ start, end }] : [];
  });
}
