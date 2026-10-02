import { wallMysqlToUtcMysql, utcDateToZonedParts, dateToMysqlUtcDateTime } from './zonedWallTime.util.js';
const utc = value => value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T').replace(/Z$/, '')}Z`);
/** Only the exact old wall-clock-as-UTC fingerprint is safe for automatic room-only repair. */
export function legacyOfficeWallTimeTarget(event) {
  if (!event.assignment_active || event.client_id || event.clinical_session_id || event.billing_context_id || event.note_context_id) return null;
  const start = utc(event.start_at), end = utc(event.end_at);
  if (!Number.isFinite(start.getTime()) || end - start !== 3600000 || start.getUTCMinutes() !== 0 || start.getUTCSeconds() !== 0) return null;
  if (start.getUTCDay() !== Number(event.assignment_weekday) || start.getUTCHours() !== Number(event.assignment_hour) || Number(event.room_id) !== Number(event.assignment_room_id)) return null;
  const zone = event.office_timezone || 'America/Denver';
  const local = utcDateToZonedParts(start, zone);
  if (Number(local.hour) === Number(event.assignment_hour)) return null;
  return { startAt: wallMysqlToUtcMysql(dateToMysqlUtcDateTime(start), zone), endAt: wallMysqlToUtcMysql(dateToMysqlUtcDateTime(end), zone) };
}
