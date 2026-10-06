import { isoToZonedDatetimeLocal, zonedDatetimeLocalToIso, schoolEventDisplayTimezone } from './timezones';

// Important dates use an inclusive end of day in the school's timezone.
export function buildSchoolCalendarRange({ date, endDate, startTime, endTime, timezone, allDay }) {
  const lastDate = endDate || date;
  if (!date || lastDate < date || (!allDay && (!startTime || !endTime))) return null;
  const tz = schoolEventDisplayTimezone(timezone);
  const startsAt = zonedDatetimeLocalToIso(`${date}T${allDay ? '00:00:00' : startTime}`, tz);
  const endsAt = zonedDatetimeLocalToIso(`${lastDate}T${allDay ? '23:59:59' : endTime}`, tz);
  if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) return null;
  return { startsAt, endsAt };
}

export function schoolCalendarDateBounds(event) {
  const tz = schoolEventDisplayTimezone(event.timezone);
  const start = isoToZonedDatetimeLocal(event.startsAt, tz).slice(0, 10);
  // A timed event ending at midnight does not occupy the following day.
  const endInstant = event.endsAt ? new Date(new Date(event.endsAt).getTime() - 1) : event.startsAt;
  const end = isoToZonedDatetimeLocal(endInstant, tz).slice(0, 10) || start;
  return { start, end: end < start ? start : end };
}

export function schoolCalendarOverlaps(event, start, endExclusive) {
  const bounds = schoolCalendarDateBounds(event);
  return !!bounds.start && bounds.start < endExclusive && bounds.end >= start;
}

export function schoolCalendarDayKeys(event) {
  const { start, end } = schoolCalendarDateBounds(event);
  if (!start || !end) return [];
  const keys = [];
  const day = new Date(`${start}T12:00:00Z`);
  while (day.toISOString().slice(0, 10) <= end) {
    keys.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return keys;
}
