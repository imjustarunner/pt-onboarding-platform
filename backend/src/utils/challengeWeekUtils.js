/**
 * Summit Stats Challenge: Week boundary utilities
 * Week = Sunday(cutoff) to next Sunday(cutoff). Configurable cutoff time.
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

/**
 * Get the Sunday boundary date (YYYY-MM-DD) for the week containing the given date.
 * @param {Date|string} date
 * @param {string} cutoffTime HH:MM (24h), e.g. "20:00"
 * @returns {string} YYYY-MM-DD
 */
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

/**
 * Get week range [start, end) for a given week start date.
 * @param {string} weekStartDate YYYY-MM-DD (Sunday)
 * @returns {{ start: string, end: string }} ISO date strings
 */
export function getWeekRange(weekStartDate) {
  const start = new Date(weekStartDate + 'T00:00:00');
  if (!Number.isFinite(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

/**
 * Get week datetime range [start, end) using Sunday cutoff.
 * @param {string} weekStartDate YYYY-MM-DD (Sunday boundary date)
 * @param {string} cutoffTime HH:MM (24h)
 * @returns {{ start: string, end: string }} SQL datetime strings
 */
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

export function getSeasonWeekPhase({
  klass,
  weekStartDate,
  cutoffTime = '00:00',
  timeZone = null
}) {
  const settingsRaw = klass?.season_settings_json;
  let settings = {};
  try {
    settings = typeof settingsRaw === 'string' ? JSON.parse(settingsRaw) : (settingsRaw || {});
  } catch {
    settings = {};
  }
  const postseason = settings?.postseason && typeof settings.postseason === 'object' ? settings.postseason : {};
  const anchor = klass?.starts_at
    ? getWeekStartDate(new Date(klass.starts_at), cutoffTime, timeZone)
    : String(weekStartDate || '').slice(0, 10);
  const startAnchor = new Date(`${String(anchor).slice(0, 10)}T00:00:00`);
  const currentWeek = new Date(`${String(weekStartDate || '').slice(0, 10)}T00:00:00`);
  const weekIndex = Math.max(0, Math.floor((currentWeek.getTime() - startAnchor.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const weekNumber = weekIndex + 1;
  const enabled = postseason?.enabled === true;
  const regularSeasonWeeks = Math.max(1, Number.parseInt(postseason?.regularSeasonWeeks, 10) || 10);
  const hasBreakWeek = postseason?.hasBreakWeek === true;
  const breakWeekNumber = hasBreakWeek ? Math.max(1, Number.parseInt(postseason?.breakWeekNumber, 10) || (regularSeasonWeeks + 1)) : null;
  const playoffWeekNumber = Math.max(1, Number.parseInt(postseason?.playoffWeekNumber, 10) || (regularSeasonWeeks + (hasBreakWeek ? 2 : 1)));
  const championshipWeekNumber = Math.max(playoffWeekNumber + 1, Number.parseInt(postseason?.championshipWeekNumber, 10) || (playoffWeekNumber + 1));
  let phase = 'regular_season';
  if (enabled) {
    if (weekNumber <= regularSeasonWeeks) phase = 'regular_season';
    else if (hasBreakWeek && weekNumber === breakWeekNumber) phase = 'break_week';
    else if (weekNumber === playoffWeekNumber) phase = 'playoff_week';
    else if (weekNumber === championshipWeekNumber) phase = 'championship_week';
    else if (weekNumber > championshipWeekNumber) phase = 'postseason_complete';
    else phase = 'postseason';
  }
  return {
    weekNumber,
    weekIndex,
    phase,
    regularSeasonWeeks,
    breakWeekNumber,
    playoffWeekNumber,
    championshipWeekNumber,
    postseasonEnabled: enabled
  };
}
