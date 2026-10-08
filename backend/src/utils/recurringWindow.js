import { addMonthsYmd, addDaysYmd, stepDaysForRecurrence } from './scheduleRecurrence.js';
import { utcToZonedMysqlWall } from './officeEventDateTime.util.js';
import { wallMysqlToUtcMysql } from './zonedWallTime.util.js';

export function recurringWindowEnd(now = new Date(), zone = 'America/Denver') {
  return addMonthsYmd(utcToZonedMysqlWall(now, zone).slice(0, 10), 12);
}
export function assertRecurringWindow({ recurrenceSeriesId, startAt, startDate, eventTimezone }, now = new Date()) {
  if (!recurrenceSeriesId) return;
  const zone = eventTimezone || 'America/Denver';
  const day = startDate ? String(startDate).slice(0, 10) : utcToZonedMysqlWall(startAt, zone)?.slice(0, 10);
  if (!day || day >= recurringWindowEnd(now, zone)) throw Object.assign(new Error('Recurring appointments can be scheduled only within the next year.'), { status: 400 });
}
// Use the original calendar anchor, not the last month's clamped date. Keep
// wall-clock start/end (including overnight sessions) through DST changes.
export function nextRecurringWindow(anchor, last) {
  const zone = last.event_timezone || anchor.event_timezone || 'America/Denver';
  const start = utcToZonedMysqlWall(anchor.start_at, zone);
  const end = utcToZonedMysqlWall(anchor.end_at, zone);
  const lastStart = utcToZonedMysqlWall(last.start_at, zone);
  const freq = String(last.recurrence_frequency).toUpperCase();
  if (!start || !end || !lastStart) return null;
  let day;
  if (freq === 'MONTHLY') {
    const months = (Number(lastStart.slice(0,4)) - Number(start.slice(0,4))) * 12 + Number(lastStart.slice(5,7)) - Number(start.slice(5,7)) + 1;
    day = addMonthsYmd(start.slice(0,10), months);
  } else {
    const step = stepDaysForRecurrence(freq);
    if (!step) return null;
    day = addDaysYmd(lastStart.slice(0,10), step);
  }
  const days = Math.round((Date.parse(`${utcToZonedMysqlWall(last.end_at,zone).slice(0,10)}T00:00:00Z`) - Date.parse(`${lastStart.slice(0,10)}T00:00:00Z`)) / 86400000);
  return { day, startAt: wallMysqlToUtcMysql(`${day} ${lastStart.slice(11)}`, zone),
    endAt: wallMysqlToUtcMysql(`${addDaysYmd(day, days)} ${utcToZonedMysqlWall(last.end_at, zone).slice(11)}`, zone) };
}
