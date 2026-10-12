import { addMonthsYmd, addDaysYmd, stepDaysForRecurrence } from './scheduleRecurrence.js';
import { utcToZonedMysqlWall } from './officeEventDateTime.util.js';
import { wallMysqlToUtcMysql } from './zonedWallTime.util.js';

// mysql2 returns DATE columns as midnight UTC Date objects; strings are also used by callers.
export function recurringCalendarDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

export function recurringWindowEnd(now = new Date(), zone = 'America/Denver') {
  return addMonthsYmd(utcToZonedMysqlWall(now, zone).slice(0, 10), 12);
}
export function assertRecurringWindow({ recurrenceSeriesId, startAt, startDate, eventTimezone }, now = new Date()) {
  if (!recurrenceSeriesId) return;
  const zone = eventTimezone || 'America/Denver';
  const day = startDate ? recurringCalendarDate(startDate) : utcToZonedMysqlWall(startAt, zone)?.slice(0, 10);
  if (!day || day >= recurringWindowEnd(now, zone)) throw Object.assign(new Error('Recurring events can be scheduled only within the next year. Ongoing series renew automatically.'), { status: 400 });
}
// Use the original calendar anchor, not the last month's clamped date. Keep
// wall-clock start/end (including overnight sessions) through DST changes.
export function nextRecurringWindow(anchor, last) {
  const zone = last.event_timezone || anchor.event_timezone || 'America/Denver';
  const allDay = Number(last.all_day) === 1;
  const wall = (row, edge) => allDay ? `${recurringCalendarDate(row[`${edge}_date`])} 00:00:00`
    : utcToZonedMysqlWall(row[`${edge}_at`], zone);
  const start = wall(anchor, 'start');
  const end = wall(anchor, 'end');
  const lastStart = wall(last, 'start');
  const lastEnd = wall(last, 'end');
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
  const days = Math.round((Date.parse(`${lastEnd.slice(0,10)}T00:00:00Z`) - Date.parse(`${lastStart.slice(0,10)}T00:00:00Z`)) / 86400000);
  return { day, ...(allDay ? { startDate: day, endDate: addDaysYmd(day, days) } : {}), startAt: wallMysqlToUtcMysql(`${day} ${lastStart.slice(11)}`, zone),
    endAt: wallMysqlToUtcMysql(`${addDaysYmd(day, days)} ${lastEnd.slice(11)}`, zone) };
}

export function assertMeetingBookingWindow(input, now = new Date()) {
  return assertRecurringWindow({ ...input, recurrenceSeriesId: input.recurrenceSeriesId || 'meeting' }, now);
}
