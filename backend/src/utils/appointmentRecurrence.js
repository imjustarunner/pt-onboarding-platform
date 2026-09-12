import { generateOccurrenceDates, ALL_RECURRENCE_FREQUENCIES, addDaysYmd } from './scheduleRecurrence.js';
import { utcDateToZonedParts, normalizeWallMysqlDatetime } from './zonedWallTime.util.js';

function localDigits(value, timeZone) {
  if (value instanceof Date || /[zZ]|[+-]\d{2}:?\d{2}$/.test(String(value))) {
    const p = utcDateToZonedParts(new Date(value), timeZone);
    if (!p) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second || 0)}`;
  }
  return normalizeWallMysqlDatetime(value);
}

export function expandAppointmentRecurrence({ startAt, endAt, timeZone = 'America/Denver', recurrence = 'ONCE', occurrenceCount = 12, untilDate = null }) {
  const frequency = String(recurrence).toUpperCase();
  if (!ALL_RECURRENCE_FREQUENCIES.includes(frequency)) throw Object.assign(new Error('Unsupported recurrence'), { status: 400 });
  const count = frequency === 'ONCE' ? 1 : Number(occurrenceCount);
  if (!Number.isInteger(count) || count < 1 || count > 104) throw Object.assign(new Error('Occurrence count must be between 1 and 104'), { status: 400 });
  const start = localDigits(startAt, timeZone);
  const end = localDigits(endAt, timeZone);
  if (!start || !end || end <= start) throw Object.assign(new Error('A valid session start and end are required'), { status: 400 });
  const dayOffset = Math.round((Date.parse(`${end.slice(0, 10)}T00:00:00Z`) - Date.parse(`${start.slice(0, 10)}T00:00:00Z`)) / 86400000);
  const dates = generateOccurrenceDates({ startDate: start.slice(0, 10), recurrence: frequency, occurrenceCount: count })
    .filter((date) => !untilDate || date <= String(untilDate).slice(0, 10));
  if (!dates.length) throw Object.assign(new Error('The series ends before its first session'), { status: 400 });
  return dates.map((date) => ({ startAt: `${date} ${start.slice(11)}`, endAt: `${addDaysYmd(date, dayOffset)} ${end.slice(11)}` }));
}
