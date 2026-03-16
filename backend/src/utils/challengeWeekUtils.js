/**
 * Summit Stats Challenge: Week boundary utilities
 * Week = Sunday to Sunday. Configurable start time (e.g., 00:00).
 */

/**
 * Get the Sunday date for the week containing the given date.
 * @param {Date|string} date
 * @returns {string} YYYY-MM-DD
 */
export function getWeekStartDate(date) {
  const d = date instanceof Date ? new Date(date) : new Date(String(date));
  if (!Number.isFinite(d.getTime())) return null;
  const day = d.getDay();
  const diff = d.getDate() - day;
  const sunday = new Date(d);
  sunday.setDate(diff);
  return sunday.toISOString().slice(0, 10);
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
