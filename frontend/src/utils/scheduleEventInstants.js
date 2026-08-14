import { isoToZonedDatetimeLocal, zonedDatetimeLocalToIso } from './timezones.js';

/**
 * Parse schedule / meeting instants from API or optimistic summary rows.
 * Naked MySQL or ISO-without-zone values are UTC under the storage contract.
 */
export function parseScheduleUtcInstant(raw) {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const s = String(raw || '').trim();
  if (!s) return null;
  const normalized = (/^\d{4}-\d{2}-\d{2}[ ]\d{2}:\d{2}(:\d{2})?$/.test(s))
    ? `${s.replace(' ', 'T')}${s.length === 16 ? ':00' : ''}Z`
    : (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s))
      ? `${s.length === 16 ? `${s}:00` : s}Z`
      : (s.includes('T') ? s : s.replace(' ', 'T'));
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Wall `YYYY-MM-DDTHH:mm[:ss]` in an IANA zone → UTC ISO-Z for summary state. */
export function wallDatetimeLocalToSummaryIso(localValue, timeZone) {
  const raw = String(localValue || '').trim();
  if (!raw || !timeZone) return null;
  const local = raw.length === 16 ? raw : raw.slice(0, 19).replace(' ', 'T');
  return zonedDatetimeLocalToIso(local, timeZone);
}

/**
 * Normalize a value for schedule-summary optimistic updates.
 * UTC-stored events must never treat naked wall digits as UTC by appending Z.
 */
export function toSummaryInstantIso(raw, { storesUtcInstant = false, wallTimeZone = '' } = {}) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (storesUtcInstant) {
    return wallDatetimeLocalToSummaryIso(s, wallTimeZone);
  }
  const wall = s.includes('T') ? s.slice(0, 19) : s.replace(' ', 'T').slice(0, 19);
  return wall || null;
}

/** UTC instant → datetime-local string in the given IANA zone (for edit forms). */
export function toZonedDatetimeLocalValue(raw, timeZone) {
  const d = parseScheduleUtcInstant(raw);
  if (!d) return '';
  const zoned = isoToZonedDatetimeLocal(d.toISOString(), timeZone);
  if (zoned) return zoned;
  return '';
}

/** Build wall `YYYY-MM-DDTHH:mm:ss` from calendar grid cell parts (office/agency TZ). */
export function wallDatetimeFromParts(dateYmd, hour, minute) {
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${String(dateYmd).slice(0, 10)}T${pad2(hour)}:${pad2(minute)}:00`;
}

/** Add duration to a wall datetime in a zone; returns wall end `YYYY-MM-DDTHH:mm:ss`. */
export function wallDatetimeEndFromStart(wallStart, durationMs, timeZone) {
  const startIso = wallDatetimeLocalToSummaryIso(wallStart, timeZone);
  if (!startIso || !Number.isFinite(durationMs)) return '';
  const endIso = new Date(new Date(startIso).getTime() + durationMs).toISOString();
  const zoned = isoToZonedDatetimeLocal(endIso, timeZone);
  if (!zoned) return '';
  return zoned.length === 16 ? `${zoned}:00` : zoned.slice(0, 19).replace('T', ' ').replace(' ', 'T');
}

/**
 * Normalize schedule POST/PATCH times: wall `YYYY-MM-DDTHH:mm:ss` + IANA `timeZone`.
 * Do not send browser `toISOString()` for grid/form edits — server converts wall+zone → UTC.
 */
export function buildScheduleWritePayload({ startAt, endAt, timeZone }) {
  const tz = String(timeZone || '').trim();
  if (!tz) {
    throw new Error('timeZone is required for schedule writes');
  }
  const toWall = (value) => {
    const s = String(value || '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
      return s.slice(0, 19).replace(' ', 'T');
    }
    if (s.length === 16 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
      return `${s}:00`;
    }
    return s.slice(0, 19);
  };
  const start = toWall(startAt);
  const end = toWall(endAt);
  if (!start || !end) {
    throw new Error('startAt and endAt are required');
  }
  return { startAt: start, endAt: end, timeZone: tz };
}
