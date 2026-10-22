import { wallMysqlToUtcMysql, utcDateToZonedParts } from '../utils/zonedWallTime.util.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export const MAX_REPLACEMENT_SLOTS = 24;
const fail = message => Object.assign(new Error(message), { status: 400 });
export function replacementWallTime(value, zone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value))) throw fail('Choose a date and time.');
  const utc = wallMysqlToUtcMysql(value.replace('T', ' ') + ':00', zone);
  const date = utc && parseUtcDate(utc), parts = date && utcDateToZonedParts(date, zone);
  const pad = n => String(n).padStart(2, '0');
  if (!parts || `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}` !== value) {
    throw fail('That local time does not exist. Choose another time.');
  }
  return date;
}

export function replacementOpeningWindow({ localStart, localEnd, durationMinutes, gapMinutes = 0 }, zone, now = new Date()) {
  const duration = Number(durationMinutes), gap = Number(gapMinutes);
  if (![30, 45, 60].includes(duration)) throw fail('Choose 30, 45, or 60 minute sessions.');
  if (!Number.isInteger(gap) || gap < 0 || gap > 120) throw fail('Choose a gap between 0 and 120 minutes.');
  const start = replacementWallTime(localStart, zone), end = replacementWallTime(localEnd, zone);
  if (localStart.slice(0, 10) !== localEnd.slice(0, 10) || +end <= +start || +end - +start > 12 * 3600000) throw fail('Choose a time window on one day, up to 12 hours.');
  // Avoid silently repeating/skipping a clock hour in a day-window generator.
  if (+end - +start !== Date.parse(localEnd + 'Z') - Date.parse(localStart + 'Z')) throw fail('Choose a window that does not cross a daylight-saving clock change.');
  if (+start <= +now || +end > +now + 120 * 86400000) throw fail('Choose a future time window within 120 days.');
  const slots = [];
  for (let at = +start; at + duration * 60000 <= +end; at += (duration + gap) * 60000) {
    slots.push({ startAt: new Date(at).toISOString(), endAt: new Date(at + duration * 60000).toISOString() });
  }
  if (!slots.length) throw fail('The time window must fit at least one complete session.');
  if (slots.length > MAX_REPLACEMENT_SLOTS) throw fail(`Choose up to ${MAX_REPLACEMENT_SLOTS} openings at a time.`);
  return { start, end, slots };
}
