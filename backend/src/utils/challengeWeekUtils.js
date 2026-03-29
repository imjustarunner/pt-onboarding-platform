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

/**
 * Get the Sunday boundary date (YYYY-MM-DD) for the week containing the given date.
 * @param {Date|string} date
 * @param {string} cutoffTime HH:MM (24h), e.g. "20:00"
 * @returns {string} YYYY-MM-DD
 */
export function getWeekStartDate(date, cutoffTime = '00:00') {
  const d = date instanceof Date ? new Date(date) : new Date(String(date));
  if (!Number.isFinite(d.getTime())) return null;
  const { hours, minutes } = parseCutoffTime(cutoffTime);
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
export function getWeekDateTimeRange(weekStartDate, cutoffTime = '00:00') {
  const { hours, minutes } = parseCutoffTime(cutoffTime);
  const start = new Date(`${weekStartDate}T00:00:00`);
  if (!Number.isFinite(start.getTime())) return null;
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const toSql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { start: toSql(start), end: toSql(end) };
}
