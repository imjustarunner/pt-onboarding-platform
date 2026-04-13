/**
 * Summit Stats Team Challenge: Week boundary utilities (mirrors backend/src/utils/challengeWeekUtils.js).
 * Week = Sunday(cutoff) to next Sunday(cutoff). Configurable cutoff time and IANA timezone.
 */

const parseCutoffTime = (cutoffTime) => {
  const raw = String(cutoffTime || '00:00').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hours: 0, minutes: 0 };
  const hours = Math.max(0, Math.min(23, Number.parseInt(m[1], 10) || 0));
  const minutes = Math.max(0, Math.min(59, Number.parseInt(m[2], 10) || 0));
  return { hours, minutes };
};

const isValidTimeZone = (tz) => {
  const zone = String(tz || '').trim();
  if (!zone) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const normalizeTimeZone = (tz, fallback = 'UTC') => (isValidTimeZone(tz) ? String(tz).trim() : fallback);

const zonedParts = (date, timeZone) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: weekdayMap[out.weekday] ?? 0
  };
};

const zonedTimeToUtcDate = ({ year, month, day, hour, minute, second = 0, timeZone }) => {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(guess, timeZone);
    const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const gotUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = targetUtc - gotUtc;
    if (!delta) break;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
};

const toYmd = (year, month, day) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function getWeekStartDate(date, cutoffTime = '00:00', timeZone = null) {
  const d = date instanceof Date ? new Date(date) : new Date(String(date));
  if (!Number.isFinite(d.getTime())) return null;
  const { hours, minutes } = parseCutoffTime(cutoffTime);
  const tz = timeZone ? normalizeTimeZone(timeZone, null) : null;
  if (tz) {
    const p = zonedParts(d, tz);
    const cal = new Date(Date.UTC(p.year, p.month - 1, p.day));
    cal.setUTCDate(cal.getUTCDate() - p.weekday);
    const boundary = zonedTimeToUtcDate({
      year: cal.getUTCFullYear(),
      month: cal.getUTCMonth() + 1,
      day: cal.getUTCDate(),
      hour: hours,
      minute: minutes,
      second: 0,
      timeZone: tz
    });
    if (d.getTime() < boundary.getTime()) {
      cal.setUTCDate(cal.getUTCDate() - 7);
    }
    return toYmd(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate());
  }
  const day = d.getDay();
  const diff = d.getDate() - day;
  const thisSunday = new Date(d);
  thisSunday.setDate(diff);
  thisSunday.setHours(hours, minutes, 0, 0);
  const start = new Date(thisSunday);
  if (d.getTime() < thisSunday.getTime()) {
    start.setDate(start.getDate() - 7);
  }
  return start.toISOString().slice(0, 10);
}

export function getWeekDateTimeRange(weekStartDate, cutoffTime = '00:00', timeZone = null) {
  const { hours, minutes } = parseCutoffTime(cutoffTime);
  const tz = timeZone ? normalizeTimeZone(timeZone, null) : null;
  if (tz) {
    const [yRaw, mRaw, dRaw] = String(weekStartDate || '').slice(0, 10).split('-');
    const y = Number(yRaw);
    const m = Number(mRaw);
    const d = Number(dRaw);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const startUtc = zonedTimeToUtcDate({ year: y, month: m, day: d, hour: hours, minute: minutes, second: 0, timeZone: tz });
    const calEnd = new Date(Date.UTC(y, m - 1, d));
    calEnd.setUTCDate(calEnd.getUTCDate() + 7);
    const endUtc = zonedTimeToUtcDate({
      year: calEnd.getUTCFullYear(),
      month: calEnd.getUTCMonth() + 1,
      day: calEnd.getUTCDate(),
      hour: hours,
      minute: minutes,
      second: 0,
      timeZone: tz
    });
    const toSql = (dt) => dt.toISOString().slice(0, 19).replace('T', ' ');
    return { start: toSql(startUtc), end: toSql(endUtc) };
  }
  const start = new Date(`${weekStartDate}T00:00:00`);
  if (!Number.isFinite(start.getTime())) return null;
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const toSql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { start: toSql(start), end: toSql(end) };
}

/** Whole calendar days between two YYYY-MM-DD strings (UTC noon anchors, DST-safe). Mirrors backend ymdUtcDiffDays. */
export function ymdUtcDiffDays(ymdA, ymdB) {
  const a = String(ymdA || '').slice(0, 10);
  const b = String(ymdB || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0;
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
  return Math.round((db - da) / 86400000);
}
