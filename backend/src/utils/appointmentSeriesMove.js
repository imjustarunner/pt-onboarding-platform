import { utcToZonedMysqlWall, parseUtcDate } from './officeEventDateTime.util.js';
import { clientScheduleInstantToUtcMysql, dateToMysqlUtcDateTime } from './zonedWallTime.util.js';
import { addDaysYmd } from './scheduleRecurrence.js';

/** Shift calendar dates and local clock time together, preserving DST wall time. */
export function shiftedAppointmentWindow(occurrenceStart, { originalStartAt, startAt, endAt, timeZone }) {
  const original = utcToZonedMysqlWall(originalStartAt, timeZone);
  const target = utcToZonedMysqlWall(startAt, timeZone);
  const occurrence = utcToZonedMysqlWall(occurrenceStart, timeZone);
  const days = Math.round((Date.parse(`${target.slice(0, 10)}T12:00:00Z`) - Date.parse(`${original.slice(0, 10)}T12:00:00Z`)) / 86400000);
  const date = addDaysYmd(occurrence.slice(0, 10), days);
  const start = clientScheduleInstantToUtcMysql(`${date} ${target.slice(11)}`, timeZone);
  if (!start) throw Object.assign(new Error('A recurring session would fall in a nonexistent local time. Choose another time.'), { status: 400 });
  return { startAt: start, endAt: dateToMysqlUtcDateTime(new Date(+parseUtcDate(start) + (+parseUtcDate(endAt) - +parseUtcDate(startAt)))) };
}
