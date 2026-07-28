/**
 * Office schedule datetime helpers.
 * Contract: office_events.start_at / end_at are true UTC DATETIME (pool +00:00).
 * Wall clock meaning always comes from office_locations.timezone.
 */

import {
  dateToMysqlUtcDateTime,
  utcDateToZonedParts,
  utcDateToZonedYmd,
  zonedDateHourToMysqlUtc,
  zonedWallTimeToUtc,
  isValidTimeZone
} from './zonedWallTime.util.js';

export function resolveOfficeTimeZone(tz) {
  const s = String(tz || '').trim();
  return isValidTimeZone(s) ? s : 'America/Denver';
}

/**
 * Wall YMD + hour in office TZ → MySQL UTC DATETIME.
 * Supports hour overflow (e.g. 24 → next day 00:00) like legacy helpers.
 */
export function mysqlDateTimeForDateHour(dateYmd, hour24, timeZone) {
  const ymd = String(dateYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const totalHours = Number(hour24);
  if (!Number.isFinite(totalHours)) return null;
  const dayOffset = Math.floor(totalHours / 24);
  const normalizedHour = ((totalHours % 24) + 24) % 24;
  let targetYmd = ymd;
  if (dayOffset !== 0) {
    const [y, m, d] = ymd.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() + dayOffset);
    const yy = base.getUTCFullYear();
    const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(base.getUTCDate()).padStart(2, '0');
    targetYmd = `${yy}-${mm}-${dd}`;
  }
  return zonedDateHourToMysqlUtc(targetYmd, normalizedHour, resolveOfficeTimeZone(timeZone));
}

/** Inclusive local calendar-day bounds as UTC MySQL DATETIME strings. */
export function localDayUtcBounds(ymd, timeZone) {
  const day = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const tz = resolveOfficeTimeZone(timeZone);
  const startAt = zonedDateHourToMysqlUtc(day, 0, tz);
  const endExclusiveYmd = (() => {
    const [y, m, d] = day.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() + 1);
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
  })();
  const endExclusive = zonedDateHourToMysqlUtc(endExclusiveYmd, 0, tz);
  // Inclusive end for BETWEEN-style queries: one second before next local midnight.
  const endUtc = zonedWallTimeToUtc({
    year: Number(endExclusiveYmd.slice(0, 4)),
    month: Number(endExclusiveYmd.slice(5, 7)),
    day: Number(endExclusiveYmd.slice(8, 10)),
    hour: 0,
    minute: 0,
    second: 0,
    timeZone: tz
  });
  const endInclusive = new Date(endUtc.getTime() - 1000);
  return {
    startAt,
    endAt: dateToMysqlUtcDateTime(endInclusive),
    endExclusive
  };
}

/** Today in office TZ → UTC bounds. */
export function officeTodayUtcBounds(timeZone) {
  const tz = resolveOfficeTimeZone(timeZone);
  const ymd = utcDateToZonedYmd(new Date(), tz);
  return localDayUtcBounds(ymd, tz);
}

/** Normalize any Date/mysql/ISO to MySQL UTC DATETIME digits. */
export function toMysqlUtcDateTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return dateToMysqlUtcDateTime(value);
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
    // Ambiguous digits: treat as already-UTC under the contract.
    return raw.slice(0, 19);
  }
  const d = new Date(raw);
  return dateToMysqlUtcDateTime(d);
}

/** UTC instant → wall `YYYY-MM-DD HH:MM:SS` in office TZ (for kiosk/API display). */
export function utcToZonedMysqlWall(value, timeZone) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = utcDateToZonedParts(d, resolveOfficeTimeZone(timeZone));
  if (!parts) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/**
 * UTC DATETIME → RFC3339 local wall (no Z) for Google Calendar + building timeZone.
 */
export function utcToRfc3339Wall(value, timeZone) {
  const wall = utcToZonedMysqlWall(value, timeZone);
  return wall ? wall.replace(' ', 'T') : null;
}

export function parseUtcDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
    const d = new Date(`${raw.replace(' ', 'T')}Z`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}
