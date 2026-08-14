/**
 * Convert a calendar wall clock in an IANA timezone to a UTC Date (handles DST).
 */

export function isValidTimeZone(tz) {
  const s = String(tz || '').trim();
  if (!s) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getTimeZoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const asUtc = new Date(
    Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second)
    )
  );
  return date.getTime() - asUtc.getTime();
}

export function zonedWallTimeToUtc({ year, month, day, hour, minute, second = 0, timeZone }) {
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : 'America/New_York';
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 2; i += 1) {
    const offset = getTimeZoneOffsetMs(guess, tz);
    guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second) + offset);
  }
  return guess;
}

/**
 * Calendar YYYY-MM-DD for an instant in a given IANA zone (matches skills_groups.start_date / end_date semantics).
 * @param {Date|string|number} date
 * @param {string} timeZone
 * @returns {string|null}
 */
export function utcDateToZonedYmd(date, timeZone) {
  if (date == null) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : 'America/New_York';
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = dtf.formatToParts(d);
    const map = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    const y = map.year;
    const m = map.month;
    const day = map.day;
    if (!y || !m || !day) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

/** Normalize any Date/ISO/mysql value to ISO UTC string (or null). */
export function toUtcIso(date) {
  if (date == null || date === '') return null;
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Format a UTC instant as MySQL DATETIME digits in UTC (`YYYY-MM-DD HH:MM:SS`).
 * Use when inserting/updating DATETIME under pool timezone +00:00.
 */
export function dateToMysqlUtcDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${mi}:${s}`;
}

/**
 * Wall-clock YMD + hour in a zone → MySQL UTC DATETIME string.
 */
export function zonedDateHourToMysqlUtc(dateYmd, hour24, timeZone) {
  const ymd = String(dateYmd || '').slice(0, 10);
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const hour = Number(hour24);
  if (!Number.isFinite(hour)) return null;
  const utc = zonedWallTimeToUtc({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour,
    minute: 0,
    second: 0,
    timeZone
  });
  return dateToMysqlUtcDateTime(utc);
}

/**
 * Parts of a UTC instant in an IANA zone (for datetime-local style fields).
 */
export function utcDateToZonedParts(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : 'America/New_York';
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = dtf.formatToParts(d);
    const map = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    let hour = Number(map.hour);
    if (hour === 24) hour = 0;
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour,
      minute: Number(map.minute),
      second: Number(map.second || 0)
    };
  } catch {
    return null;
  }
}

export const DEFAULT_SCHEDULE_TZ = 'America/Denver';

/** Parse `YYYY-MM-DD[ T]HH:MM[:SS]` wall digits (no TZ interpretation). */
export function parseMysqlWallParts(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] || 0)
  };
}

/**
 * Wall-clock MySQL DATETIME string in `timeZone` → UTC MySQL DATETIME digits.
 * Use on write when the client sends agency/office face time.
 */
export function wallMysqlToUtcMysql(wall, timeZone = DEFAULT_SCHEDULE_TZ) {
  const parts = parseMysqlWallParts(wall);
  if (!parts) return null;
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : DEFAULT_SCHEDULE_TZ;
  const utc = zonedWallTimeToUtc({ ...parts, timeZone: tz });
  return dateToMysqlUtcDateTime(utc);
}

/**
 * Preserve wall digits from datetime-local / MySQL-ish payloads (no TZ convert).
 * Returns `YYYY-MM-DD HH:MM:SS` or null.
 */
export function normalizeWallMysqlDatetime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return dateToMysqlUtcDateTime(value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 19);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    const normalized = raw.length === 16 ? `${raw}:00` : raw;
    return normalized.replace('T', ' ').slice(0, 19);
  }
  // ISO with Z/offset: take UTC digits (caller should prefer wallMysqlToUtcMysql for wall inputs).
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) || /^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    return dateToMysqlUtcDateTime(d);
  }
  const parts = parseMysqlWallParts(raw);
  if (!parts) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/**
 * UTC MySQL DATETIME / Date / ISO → ISO-8601 with Z for schedule APIs.
 * Naked `YYYY-MM-DD HH:MM:SS` is treated as already-UTC under the contract.
 */
export function utcMysqlToIso(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(`${raw.replace(' ', 'T')}Z`);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** True when the payload is an absolute instant (ISO-Z or numeric offset), not wall digits. */
export function isScheduleUtcInstantString(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  return /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
}

/**
 * Normalize schedule instants already stored in MySQL (naked digits = UTC under the contract).
 */
export function normalizeUtcMysqlScheduleInstant(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return dateToMysqlUtcDateTime(value);
  const raw = String(value).trim();
  if (!raw) return null;
  if (isScheduleUtcInstantString(raw)) {
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? dateToMysqlUtcDateTime(d) : null;
  }
  const parts = parseMysqlWallParts(raw);
  if (!parts) {
    const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
    return Number.isFinite(d.getTime()) ? dateToMysqlUtcDateTime(d) : null;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/**
 * Client write path: wall clock + IANA zone, or ISO-Z offset instant → UTC MySQL digits.
 */
export function clientScheduleInstantToUtcMysql(value, timeZone) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (isScheduleUtcInstantString(raw)) {
    return normalizeUtcMysqlScheduleInstant(value);
  }
  const wall = normalizeWallMysqlDatetime(value);
  if (!wall) return null;
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : DEFAULT_SCHEDULE_TZ;
  return wallMysqlToUtcMysql(wall, tz);
}

/**
 * UTC MySQL / ISO → wall `YYYY-MM-DD HH:MM:SS` in an IANA zone (Google Calendar dateTime).
 */
export function utcMysqlToZonedWallMysql(value, timeZone) {
  const iso = utcMysqlToIso(normalizeUtcMysqlScheduleInstant(value));
  if (!iso) return null;
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : DEFAULT_SCHEDULE_TZ;
  const parts = utcDateToZonedParts(new Date(iso), tz);
  if (!parts) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/**
 * Schedule instant → wall MySQL for Google Calendar.
 * @param {{ fromStorage?: boolean }} opts — `fromStorage: true` when value is DB UTC digits.
 */
export function scheduleInstantToWallMysql(value, timeZone, { fromStorage = false } = {}) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (fromStorage || isScheduleUtcInstantString(raw)) {
    return utcMysqlToZonedWallMysql(value, timeZone);
  }
  const wall = normalizeWallMysqlDatetime(value);
  return wall || null;
}

/** Subtract whole hours from a UTC MySQL DATETIME (instant math). */
export function subtractHoursFromUtcMysql(utcMysql, hours = 1) {
  const iso = utcMysqlToIso(utcMysql);
  if (!iso) return null;
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() - Number(hours || 0));
  return dateToMysqlUtcDateTime(d);
}
