import { icalTimeZoneLines } from '../utils/icalTimeZone.js';
import { isValidTimeZone, utcDateToZonedParts, utcMysqlToIso, utcDateToZonedYmd, zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';

const storedDate = value => new Date(utcMysqlToIso(value) || NaN);
const eventZone = event => isValidTimeZone(event?.timezone) ? event.timezone : 'UTC';
const localCalendarDate = parts => new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
const wallCalendarStamp = (date, zone) => { const p = utcDateToZonedParts(date, zone); return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`; };

// Company/program events have a finite end window, also used by their session
// materializer. Exports and next-occurrence previews must use the same boundary.
function calendarRecurrence(event) {
  const recurrence = normalizeRecurrence(event?.recurrence);
  if (recurrence.frequency === 'none') return recurrence;
  const endYmd = utcDateToZonedYmd(storedDate(event?.endsAt || event?.ends_at), eventZone(event));
  return { ...recurrence, untilDate: [recurrence.untilDate, endYmd].filter(Boolean).sort().at(-1) };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function parseJsonMaybe(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeRecurrence(input = null) {
  if (!input || typeof input !== 'object') {
    return { frequency: 'none' };
  }
  const frequencyRaw = String(input.frequency || input.type || 'none').trim().toLowerCase();
  const frequency = ['weekly', 'monthly'].includes(frequencyRaw) ? frequencyRaw : 'none';
  if (frequency === 'none') return { frequency: 'none' };

  const intervalValue = Number.parseInt(String(input.interval || '1'), 10);
  const interval = Number.isFinite(intervalValue) && intervalValue > 0 ? Math.min(intervalValue, 24) : 1;
  const untilDate = input.untilDate ? String(input.untilDate).slice(0, 10) : null;

  if (frequency === 'weekly') {
    const source = Array.isArray(input.byWeekday) ? input.byWeekday : [];
    const cleaned = [...new Set(source
      .map((d) => Number.parseInt(String(d), 10))
      .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6)
    )].sort((a, b) => a - b);
    return {
      frequency,
      interval,
      byWeekday: cleaned,
      untilDate
    };
  }

  const byMonthDayRaw = Number.parseInt(String(input.byMonthDay || 0), 10);
  const byMonthDay = Number.isFinite(byMonthDayRaw) && byMonthDayRaw >= 1 && byMonthDayRaw <= 31
    ? byMonthDayRaw
    : null;
  return {
    frequency,
    interval,
    byMonthDay,
    untilDate
  };
}

export function recurrenceToRRule(recurrence, startsAt, timeZone = 'UTC') {
  const cfg = normalizeRecurrence(recurrence);
  if (cfg.frequency === 'none') return null;
  if (!(startsAt instanceof Date) || !Number.isFinite(startsAt.getTime())) return null;
  const pieces = [];
  if (cfg.frequency === 'weekly') {
    pieces.push('FREQ=WEEKLY');
    if (cfg.interval > 1) pieces.push(`INTERVAL=${cfg.interval}`);
    const map = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const days = (cfg.byWeekday || []).map((d) => map[d]).filter(Boolean);
    if (days.length) pieces.push(`BYDAY=${days.join(',')}`);
  } else if (cfg.frequency === 'monthly') {
    pieces.push('FREQ=MONTHLY');
    if (cfg.interval > 1) pieces.push(`INTERVAL=${cfg.interval}`);
    if (cfg.byMonthDay) pieces.push(`BYMONTHDAY=${cfg.byMonthDay}`);
  }
  if (cfg.untilDate) {
    const [year, month, day] = cfg.untilDate.split('-').map(Number);
    const date = zonedWallTimeToUtc({year,month,day,hour:23,minute:59,second:59,timeZone});
    if (Number.isFinite(date.getTime())) pieces.push(`UNTIL=${formatGoogleDate(date)}`);
  }
  return pieces.length ? `RRULE:${pieces.join(';')}` : null;
}

export function formatGoogleDate(date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z'
  ].join('');
}

export function escapeIcsText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function formatIcsDate(date) {
  return formatGoogleDate(date);
}

export function computeOccurrenceEnd(startsAtInput, endsAtInput, recurrenceInput, timeZone = 'UTC') {
  const startsAt = storedDate(startsAtInput), endsAt = storedDate(endsAtInput);
  if (!Number.isFinite(+startsAt) || !Number.isFinite(+endsAt)) return null;
  if (normalizeRecurrence(recurrenceInput).frequency === 'none') return endsAt;
  const start = utcDateToZonedParts(startsAt, timeZone), end = utcDateToZonedParts(endsAt, timeZone);
  let date = localCalendarDate(start);
  const at = () => zonedWallTimeToUtc({ year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),hour:end.hour,minute:end.minute,second:end.second,timeZone });
  let result = at();
  if (result <= startsAt) { date.setUTCDate(date.getUTCDate()+1); result = at(); }
  return result;
}

export function makeGoogleCalendarUrl(event) {
  if (event?.dateToBeDecided) return null;
  const startsAt = storedDate(event?.startsAt || event?.starts_at);
  const endsAt = storedDate(event?.endsAt || event?.ends_at);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  const occurrenceEnd = computeOccurrenceEnd(startsAt, endsAt, event?.recurrence, eventZone(event));
  if (!occurrenceEnd) return null;
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', String(event?.title || 'Company event'));
  const details = [String(event?.description || event?.splashContent || '').trim(), event?.staffPageUrl].filter(Boolean).join('\n\n');
  if (details) params.set('details', details);
  const zone = eventZone(event);
  params.set('ctz', zone);
  const recurring = normalizeRecurrence(event?.recurrence).frequency !== 'none';
  params.set('dates', recurring ? `${wallCalendarStamp(startsAt, zone)}/${wallCalendarStamp(occurrenceEnd, zone)}` : `${formatGoogleDate(startsAt)}/${formatGoogleDate(occurrenceEnd)}`);
  const recurrenceRule = recurrenceToRRule(calendarRecurrence(event), startsAt, eventZone(event));
  if (recurrenceRule) params.set('recur', recurrenceRule);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildEventIcs(event) {
  if (event?.dateToBeDecided) return null;
  const startsAt = storedDate(event?.startsAt || event?.starts_at);
  const endsAt = storedDate(event?.endsAt || event?.ends_at);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  const occurrenceEnd = computeOccurrenceEnd(startsAt, endsAt, event?.recurrence, eventZone(event));
  if (!occurrenceEnd) return null;
  const recurrenceRule = recurrenceToRRule(calendarRecurrence(event), startsAt, eventZone(event));
  const uid = `company-event-${event?.id || 'unknown'}@ptonboardingapp`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PTOnboardingApp//CompanyEvents//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(recurrenceRule ? icalTimeZoneLines(eventZone(event), startsAt, new Date(`${calendarRecurrence(event).untilDate}T23:59:59Z`)) : []),
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    recurrenceRule ? `DTSTART;TZID=${eventZone(event)}:${wallCalendarStamp(startsAt, eventZone(event))}` : `DTSTART:${formatIcsDate(startsAt)}`,
    recurrenceRule ? `DTEND;TZID=${eventZone(event)}:${wallCalendarStamp(occurrenceEnd, eventZone(event))}` : `DTEND:${formatIcsDate(occurrenceEnd)}`,
    `SUMMARY:${escapeIcsText(event?.title || 'Company event')}`
  ];
  const desc = [String(event?.description || event?.splashContent || '').trim(), event?.staffPageUrl].filter(Boolean).join('\n\n');
  if (desc) lines.push(`DESCRIPTION:${escapeIcsText(desc)}`);
  if (event?.staffPageUrl && /^https:\/\//.test(event.staffPageUrl)) lines.push(`URL:${escapeIcsText(event.staffPageUrl)}`);
  if (recurrenceRule) lines.push(recurrenceRule);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function computeNextOccurrence(event, nowInput = new Date()) {
  if (event?.dateToBeDecided) return null;
  const now = nowInput instanceof Date ? nowInput : storedDate(nowInput);
  const startsAt = storedDate(event?.startsAt || event?.starts_at), endsAt = storedDate(event?.endsAt || event?.ends_at);
  if (![now, startsAt, endsAt].every(value => Number.isFinite(+value))) return null;
  const recurrence = calendarRecurrence(event), timeZone = eventZone(event);
  if (recurrence.frequency === 'none') return startsAt >= now ? {startsAt, endsAt} : null;
  const start = utcDateToZonedParts(startsAt, timeZone), base = localCalendarDate(start);
  const candidate = date => {
    const ymd = date.toISOString().slice(0,10);
    if (recurrence.untilDate && ymd > recurrence.untilDate) return null;
    const instant = zonedWallTimeToUtc({year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),hour:start.hour,minute:start.minute,second:start.second,timeZone});
    return instant >= now && instant >= startsAt ? { startsAt:instant, endsAt:computeOccurrenceEnd(instant,endsAt,recurrence,timeZone) } : null;
  };
  if (recurrence.frequency === 'weekly') {
    const days = recurrence.byWeekday?.length ? recurrence.byWeekday : [base.getUTCDay()];
    const nowDay = localCalendarDate(utcDateToZonedParts(now, timeZone));
    const firstOffset = Math.max(0, Math.floor((nowDay - base) / 86400000) - 1);
    for (let offset=firstOffset;offset<=firstOffset+366*2;offset++) {
      const date = new Date(+base+offset*86400000);
      if (Math.floor(offset/7) % (recurrence.interval || 1) || !days.includes(date.getUTCDay())) continue;
      const result = candidate(date); if (result) return result;
    }
  } else if (recurrence.frequency === 'monthly') {
    const day = recurrence.byMonthDay || start.day;
    const current = utcDateToZonedParts(now, timeZone);
    const firstOffset = Math.max(0, Math.floor(((current.year - start.year) * 12 + current.month - start.month) / (recurrence.interval || 1)));
    for (let offset=firstOffset;offset<=firstOffset+48;offset++) {
      const date = new Date(Date.UTC(start.year,start.month-1+offset*(recurrence.interval || 1),day));
      if (date.getUTCDate() !== day) continue;
      const result = candidate(date); if (result) return result;
    }
  }
  return null;
}
