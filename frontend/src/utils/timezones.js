/**
 * Curated IANA timezone list grouped by region.
 * Used for timezone <select> dropdowns throughout the app.
 *
 * Each entry: { value, label }
 * Groups: { label, zones[] }
 */
export const TIMEZONE_GROUPS = [
  {
    label: 'United States & Canada',
    zones: [
      { value: 'America/New_York',      label: 'Eastern Time (ET)' },
      { value: 'America/Detroit',       label: 'Eastern Time – Detroit' },
      { value: 'America/Indiana/Indianapolis', label: 'Eastern Time – Indiana' },
      { value: 'America/Chicago',       label: 'Central Time (CT)' },
      { value: 'America/Indiana/Knox',  label: 'Central Time – Indiana' },
      { value: 'America/Denver',        label: 'Mountain Time (MT)' },
      { value: 'America/Phoenix',       label: 'Mountain Time – Arizona (no DST)' },
      { value: 'America/Los_Angeles',   label: 'Pacific Time (PT)' },
      { value: 'America/Anchorage',     label: 'Alaska Time (AKT)' },
      { value: 'America/Adak',          label: 'Hawaii-Aleutian Time (HAT)' },
      { value: 'Pacific/Honolulu',      label: 'Hawaii Time (no DST)' },
      { value: 'America/Toronto',       label: 'Eastern Time – Toronto' },
      { value: 'America/Winnipeg',      label: 'Central Time – Winnipeg' },
      { value: 'America/Edmonton',      label: 'Mountain Time – Edmonton' },
      { value: 'America/Vancouver',     label: 'Pacific Time – Vancouver' },
      { value: 'America/Halifax',       label: 'Atlantic Time – Halifax' },
      { value: 'America/St_Johns',      label: 'Newfoundland Time' },
    ]
  },
  {
    label: 'Mexico & Central America',
    zones: [
      { value: 'America/Mexico_City',   label: 'Central Time – Mexico City' },
      { value: 'America/Cancun',        label: 'Eastern Time – Cancún (no DST)' },
      { value: 'America/Monterrey',     label: 'Central Time – Monterrey' },
      { value: 'America/Chihuahua',     label: 'Mountain Time – Chihuahua' },
      { value: 'America/Tijuana',       label: 'Pacific Time – Tijuana' },
      { value: 'America/Guatemala',     label: 'Central Time – Guatemala' },
      { value: 'America/Costa_Rica',    label: 'Central Time – Costa Rica' },
      { value: 'America/Panama',        label: 'Eastern Time – Panama (no DST)' },
    ]
  },
  {
    label: 'South America',
    zones: [
      { value: 'America/Bogota',        label: 'Colombia Time' },
      { value: 'America/Lima',          label: 'Peru Time' },
      { value: 'America/Caracas',       label: 'Venezuela Time' },
      { value: 'America/Santiago',      label: 'Chile Time' },
      { value: 'America/Argentina/Buenos_Aires', label: 'Argentina Time' },
      { value: 'America/Sao_Paulo',     label: 'Brasília Time' },
      { value: 'America/Manaus',        label: 'Amazon Time' },
    ]
  },
  {
    label: 'Europe',
    zones: [
      { value: 'Europe/London',         label: 'GMT / British Time (BST)' },
      { value: 'Europe/Dublin',         label: 'Irish Standard Time' },
      { value: 'Europe/Lisbon',         label: 'Western European Time' },
      { value: 'Europe/Paris',          label: 'Central European Time – Paris' },
      { value: 'Europe/Berlin',         label: 'Central European Time – Berlin' },
      { value: 'Europe/Rome',           label: 'Central European Time – Rome' },
      { value: 'Europe/Madrid',         label: 'Central European Time – Madrid' },
      { value: 'Europe/Amsterdam',      label: 'Central European Time – Amsterdam' },
      { value: 'Europe/Brussels',       label: 'Central European Time – Brussels' },
      { value: 'Europe/Warsaw',         label: 'Central European Time – Warsaw' },
      { value: 'Europe/Stockholm',      label: 'Central European Time – Stockholm' },
      { value: 'Europe/Helsinki',       label: 'Eastern European Time – Helsinki' },
      { value: 'Europe/Athens',         label: 'Eastern European Time – Athens' },
      { value: 'Europe/Bucharest',      label: 'Eastern European Time – Bucharest' },
      { value: 'Europe/Kiev',           label: 'Eastern European Time – Kyiv' },
      { value: 'Europe/Moscow',         label: 'Moscow Standard Time' },
    ]
  },
  {
    label: 'Africa',
    zones: [
      { value: 'Africa/Cairo',          label: 'Eastern European Time – Cairo' },
      { value: 'Africa/Lagos',          label: 'West Africa Time' },
      { value: 'Africa/Nairobi',        label: 'East Africa Time' },
      { value: 'Africa/Johannesburg',   label: 'South Africa Standard Time' },
      { value: 'Africa/Casablanca',     label: 'Western European Time – Casablanca' },
    ]
  },
  {
    label: 'Middle East',
    zones: [
      { value: 'Asia/Dubai',            label: 'Gulf Standard Time' },
      { value: 'Asia/Riyadh',           label: 'Arabia Standard Time – Riyadh' },
      { value: 'Asia/Kuwait',           label: 'Arabia Standard Time – Kuwait' },
      { value: 'Asia/Baghdad',          label: 'Arabia Standard Time – Baghdad' },
      { value: 'Asia/Tehran',           label: 'Iran Standard Time' },
      { value: 'Asia/Jerusalem',        label: 'Israel Standard Time' },
      { value: 'Asia/Amman',            label: 'Arabia Standard Time – Amman' },
    ]
  },
  {
    label: 'Asia',
    zones: [
      { value: 'Asia/Karachi',          label: 'Pakistan Standard Time' },
      { value: 'Asia/Kolkata',          label: 'India Standard Time' },
      { value: 'Asia/Colombo',          label: 'Sri Lanka Standard Time' },
      { value: 'Asia/Kathmandu',        label: 'Nepal Time' },
      { value: 'Asia/Dhaka',            label: 'Bangladesh Standard Time' },
      { value: 'Asia/Rangoon',          label: 'Myanmar Time' },
      { value: 'Asia/Bangkok',          label: 'Indochina Time – Bangkok' },
      { value: 'Asia/Jakarta',          label: 'Western Indonesia Time' },
      { value: 'Asia/Singapore',        label: 'Singapore Standard Time' },
      { value: 'Asia/Kuala_Lumpur',     label: 'Malaysia Time' },
      { value: 'Asia/Manila',           label: 'Philippine Standard Time' },
      { value: 'Asia/Shanghai',         label: 'China Standard Time' },
      { value: 'Asia/Hong_Kong',        label: 'Hong Kong Time' },
      { value: 'Asia/Taipei',           label: 'Taipei Standard Time' },
      { value: 'Asia/Seoul',            label: 'Korea Standard Time' },
      { value: 'Asia/Tokyo',            label: 'Japan Standard Time' },
    ]
  },
  {
    label: 'Pacific & Oceania',
    zones: [
      { value: 'Australia/Perth',       label: 'Australian Western Time' },
      { value: 'Australia/Darwin',      label: 'Australian Central Time (no DST)' },
      { value: 'Australia/Adelaide',    label: 'Australian Central Time – Adelaide' },
      { value: 'Australia/Brisbane',    label: 'Australian Eastern Time (no DST)' },
      { value: 'Australia/Sydney',      label: 'Australian Eastern Time – Sydney' },
      { value: 'Australia/Melbourne',   label: 'Australian Eastern Time – Melbourne' },
      { value: 'Pacific/Auckland',      label: 'New Zealand Standard Time' },
      { value: 'Pacific/Fiji',          label: 'Fiji Time' },
      { value: 'Pacific/Guam',          label: 'Chamorro Standard Time – Guam' },
    ]
  },
  {
    label: 'Universal',
    zones: [
      { value: 'UTC',                   label: 'UTC (Coordinated Universal Time)' },
    ]
  }
];

/** Flat array of all { value, label } entries for easy lookup. */
export const ALL_TIMEZONES = TIMEZONE_GROUPS.flatMap(g => g.zones);

/** Return the display label for a given IANA value, or the raw value if not found. */
export function timezoneLabelFor(value) {
  return ALL_TIMEZONES.find(z => z.value === value)?.label ?? value ?? 'UTC';
}

/**
 * Best-guess the user's local IANA timezone from the browser.
 * Falls back to 'America/New_York'.
 */
export function detectLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/**
 * Format a JS Date (or ISO string) in a given IANA timezone and clock format.
 * @param {Date|string} date
 * @param {string} timezone  IANA timezone identifier
 * @param {'12h'|'24h'} timeFormat
 * @returns {string}
 */
export function formatInTimezone(date, timezone = 'UTC', timeFormat = '12h') {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: timezone,
    month:  'short',
    day:    'numeric',
    hour:   'numeric',
    minute: '2-digit',
    hour12: timeFormat !== '24h'
  });
}

/**
 * Compute how much time remains until a deadline (Date or ISO string).
 * Returns a human-friendly string like "3h 22m" or "2d 4h".
 * Returns '' if the deadline is in the past.
 */
export function timeUntil(deadline) {
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return '';
  const totalSec = Math.floor(diffMs / 1000);
  const days    = Math.floor(totalSec / 86400);
  const hours   = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Find the next week-submission deadline as a UTC Date.
 *
 * @param {string} weekStartsOn    e.g. 'monday'
 * @param {string} weekEndsSundayAt  HH:MM time string e.g. '23:59'
 * @param {string} weekTimeZone    IANA timezone e.g. 'America/New_York'
 * @returns {Date|null}
 */
export function getWeekDeadline(weekStartsOn = 'monday', weekEndsSundayAt = '23:59', weekTimeZone = 'UTC') {
  const [endHour, endMin] = (weekEndsSundayAt || '23:59').split(':').map(Number);
  if (isNaN(endHour) || isNaN(endMin)) return null;

  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const startIdx   = DAY_NAMES.indexOf((weekStartsOn || 'monday').toLowerCase());
  const endDayIdx  = (startIdx + 6) % 7; // day before the start day

  const now = new Date();
  // Check today and next 7 days in the season timezone
  for (let offset = 0; offset <= 7; offset++) {
    const probe = new Date(now.getTime() + offset * 86400000);

    // Weekday of probe in the season timezone
    const dayStr = new Intl.DateTimeFormat('en-US', {
      timeZone: weekTimeZone,
      weekday: 'short'
    }).format(probe);
    if (SHORT_DAYS.indexOf(dayStr) !== endDayIdx) continue;

    // Get current clock time in the season timezone
    const timeParts = new Intl.DateTimeFormat('en-US', {
      timeZone: weekTimeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(probe);
    const get  = (t) => Number(timeParts.find(p => p.type === t)?.value || 0);
    const curH = get('hour');
    const curM = get('minute');

    // Minutes from probe to the end-time on the same timezone-day
    const deltaMin = (endHour * 60 + endMin) - (curH * 60 + curM);
    const deadline = new Date(probe.getTime() + deltaMin * 60000);

    if (deadline > now) return deadline;
    // Already passed on this occurrence — keep scanning (next iteration will try next week)
  }
  return null;
}

/**
 * Return the urgency class for a countdown string.
 * 'urgent'  -> ≤ 2 h remaining
 * 'warning' -> ≤ 24 h remaining
 * 'normal'  -> > 24 h
 */
export function countdownUrgency(deadline) {
  if (!deadline) return 'normal';
  const diffMs = (deadline instanceof Date ? deadline : new Date(deadline)).getTime() - Date.now();
  if (diffMs <= 0)               return 'past';
  if (diffMs <= 2 * 3600000)    return 'urgent';
  if (diffMs <= 24 * 3600000)   return 'warning';
  return 'normal';
}
