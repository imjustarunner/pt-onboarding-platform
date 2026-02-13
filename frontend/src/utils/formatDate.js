/**
 * Format dates and times using user preferences (timezone, date_format, time_format).
 * Falls back to browser locale when preferences are not available.
 */
import { useUserPreferencesStore } from '../store/userPreferences';

function getStore() {
  try {
    return useUserPreferencesStore();
  } catch {
    return null;
  }
}

/**
 * Get Intl options for date formatting based on user preferences.
 */
function getDateOptions(prefs) {
  const df = prefs?.dateFormat || 'MM/DD';
  const tz = prefs?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = undefined; // Use browser default

  if (df === 'DD/MM') {
    return { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', locale };
  }
  if (df === 'YYYY-MM-DD') {
    return { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', locale };
  }
  // MM/DD (default)
  return { timeZone: tz, month: '2-digit', day: '2-digit', year: 'numeric', locale };
}

/**
 * Get Intl options for time formatting based on user preferences.
 */
function getTimeOptions(prefs) {
  const tf = prefs?.timeFormat || '12h';
  const tz = prefs?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (tf === '24h') {
    return { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false };
  }
  return { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true };
}

/**
 * Parse a date-like value to a Date, handling date-only strings (YYYY-MM-DD) correctly.
 * Date-only strings are parsed as local midnight to avoid timezone shift when displaying
 * (e.g. "2024-02-13" as midnight UTC would show as 2/12 in Pacific timezone).
 */
function parseDateSafe(dateLike) {
  if (dateLike instanceof Date) return dateLike;
  const s = String(dateLike || '').trim();
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s|T|$)/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }
  return new Date(s);
}

/**
 * Format a date (date only, no time).
 * @param {string|Date} dateLike - ISO string or Date
 * @returns {string}
 */
export function formatDate(dateLike) {
  if (!dateLike) return '';
  const d = parseDateSafe(dateLike);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return String(dateLike);

  const prefs = getStore();
  const opts = getDateOptions(prefs);
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

/**
 * Format a time (time only, no date).
 * @param {string|Date} dateLike - ISO string or Date
 * @returns {string}
 */
export function formatTime(dateLike) {
  if (!dateLike) return '';
  const d = parseDateSafe(dateLike);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return String(dateLike);

  const prefs = getStore();
  const opts = getTimeOptions(prefs);
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

/**
 * Format date and time together.
 * @param {string|Date} dateLike - ISO string or Date
 * @returns {string}
 */
export function formatDateTime(dateLike) {
  if (!dateLike) return '';
  const d = typeof dateLike === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(String(dateLike).trim())
    ? new Date(dateLike)
    : parseDateSafe(dateLike);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return String(dateLike);

  const prefs = getStore();
  const dateOpts = getDateOptions(prefs);
  const timeOpts = getTimeOptions(prefs);
  const dateStr = new Intl.DateTimeFormat(undefined, dateOpts).format(d);
  const timeStr = new Intl.DateTimeFormat(undefined, timeOpts).format(d);
  return `${dateStr} ${timeStr}`;
}

/**
 * Format date and time in short form (e.g. "Mon, Dec 31, 2:30 PM").
 * @param {string|Date} dateLike - ISO string or Date
 * @returns {string}
 */
export function formatDateTimeShort(dateLike) {
  if (!dateLike) return '';
  const d = typeof dateLike === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(String(dateLike).trim())
    ? new Date(dateLike)
    : parseDateSafe(dateLike);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return String(dateLike);

  const prefs = getStore();
  const tz = prefs?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tf = prefs?.timeFormat || '12h';
  const opts = {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: tf !== '24h'
  };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}
