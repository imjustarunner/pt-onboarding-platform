import pool from '../config/database.js';
import { normalizeRecurrence } from './companyEvents.service.js';
import { utcDateToZonedYmd, zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseYmd(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { year: y, month: mo, day: d };
}

function normalizeDbDateToYmd(input) {
  if (!input) return '';
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return '';
    return input.toISOString().slice(0, 10);
  }
  const raw = String(input).trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, days) {
  const p = parseYmd(ymd);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.year, p.month - 1, p.day));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
}

function toUtcMidnightDate(ymd) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

function zonedDateParts(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date || 0);
  if (!Number.isFinite(d.getTime())) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: String(timeZone || 'UTC'),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = fmt.formatToParts(d);
    const map = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second || 0)
    };
  } catch {
    return null;
  }
}

function buildOccurrenceStartFromYmd(sessionDateYmd, startWall, timezone) {
  const ymd = parseYmd(sessionDateYmd);
  if (!ymd) return null;
  return zonedWallTimeToUtc({
    year: ymd.year,
    month: ymd.month,
    day: ymd.day,
    hour: startWall.hour,
    minute: startWall.minute,
    second: startWall.second,
    timeZone: timezone
  });
}

function buildOccurrenceEndFromYmd(sessionDateYmd, endWall, timezone, startAtUtc) {
  const ymd = parseYmd(sessionDateYmd);
  if (!ymd) return null;
  let endUtc = zonedWallTimeToUtc({
    year: ymd.year,
    month: ymd.month,
    day: ymd.day,
    hour: endWall.hour,
    minute: endWall.minute,
    second: endWall.second,
    timeZone: timezone
  });
  if (Number.isFinite(startAtUtc?.getTime()) && Number.isFinite(endUtc?.getTime()) && endUtc <= startAtUtc) {
    const nextYmd = addDaysYmd(sessionDateYmd, 1);
    const next = parseYmd(nextYmd);
    if (next) {
      endUtc = zonedWallTimeToUtc({
        year: next.year,
        month: next.month,
        day: next.day,
        hour: endWall.hour,
        minute: endWall.minute,
        second: endWall.second,
        timeZone: timezone
      });
    }
  }
  return endUtc;
}

function desiredOccurrencesFromEventRow(eventRow) {
  const startsAt = new Date(eventRow?.starts_at || 0);
  const endsAt = new Date(eventRow?.ends_at || 0);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return [];
  const timezone = String(eventRow?.timezone || 'UTC').trim() || 'UTC';
  const recurrenceRaw = (() => {
    const raw = eventRow?.recurrence_json;
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      return null;
    }
  })();
  const recurrence = normalizeRecurrence(recurrenceRaw);
  const startWall = zonedDateParts(startsAt, timezone);
  const endWall = zonedDateParts(endsAt, timezone);
  if (!startWall || !endWall) return [];
  const startYmd = utcDateToZonedYmd(startsAt, timezone);
  if (!startYmd) return [];

  const eventEndYmd = utcDateToZonedYmd(endsAt, timezone);
  let lastYmd = recurrence.untilDate || eventEndYmd || startYmd;
  if (!parseYmd(lastYmd)) lastYmd = startYmd;
  if (lastYmd < startYmd) lastYmd = startYmd;

  /** @type {Array<{sessionDate: string, startsAt: Date, endsAt: Date, timezone: string}>} */
  const out = [];
  const pushByYmd = (sessionDate) => {
    const sAt = buildOccurrenceStartFromYmd(sessionDate, startWall, timezone);
    const eAt = buildOccurrenceEndFromYmd(sessionDate, endWall, timezone, sAt);
    if (!Number.isFinite(sAt?.getTime()) || !Number.isFinite(eAt?.getTime())) return;
    if (eAt <= sAt) return;
    out.push({ sessionDate, startsAt: sAt, endsAt: eAt, timezone });
  };

  if (recurrence.frequency === 'none') {
    pushByYmd(startYmd);
    return out;
  }

  if (recurrence.frequency === 'weekly') {
    const intervalWeeks = Math.max(1, Number(recurrence.interval || 1));
    const byWeekday = recurrence.byWeekday?.length ? recurrence.byWeekday : [startsAt.getUTCDay()];
    const startDateUtc = toUtcMidnightDate(startYmd);
    const lastDateUtc = toUtcMidnightDate(lastYmd);
    if (!startDateUtc || !lastDateUtc) return [];
    for (
      let cursor = new Date(startDateUtc.getTime());
      cursor.getTime() <= lastDateUtc.getTime();
      cursor = new Date(cursor.getTime() + DAY_MS)
    ) {
      const sessionDate = cursor.toISOString().slice(0, 10);
      const dayDiff = Math.floor((cursor.getTime() - startDateUtc.getTime()) / DAY_MS);
      const weeksFromStart = Math.floor(dayDiff / 7);
      if (weeksFromStart % intervalWeeks !== 0) continue;
      if (!byWeekday.includes(cursor.getUTCDay())) continue;
      pushByYmd(sessionDate);
    }
    return out;
  }

  if (recurrence.frequency === 'monthly') {
    const intervalMonths = Math.max(1, Number(recurrence.interval || 1));
    const targetMonthDay = Number(recurrence.byMonthDay || startWall.day || 1);
    const startParts = parseYmd(startYmd);
    const lastParts = parseYmd(lastYmd);
    if (!startParts || !lastParts) return [];
    const startMonthIndex = startParts.year * 12 + (startParts.month - 1);
    const lastMonthIndex = lastParts.year * 12 + (lastParts.month - 1);
    for (let monthIndex = startMonthIndex; monthIndex <= lastMonthIndex; monthIndex += intervalMonths) {
      const year = Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      const candidate = new Date(Date.UTC(year, month - 1, targetMonthDay));
      if (candidate.getUTCMonth() !== month - 1) continue;
      const sessionDate = candidate.toISOString().slice(0, 10);
      if (sessionDate < startYmd || sessionDate > lastYmd) continue;
      pushByYmd(sessionDate);
    }
    return out;
  }

  pushByYmd(startYmd);
  return out;
}

/**
 * Materialize per-occurrence rows for a program/company event.
 * Upserts by (company_event_id, session_date, starts_at) and removes stale rows.
 */
export async function materializeSessionsForEvent(connOrPool, { companyEventId }) {
  const eventId = Number(companyEventId);
  if (!Number.isFinite(eventId) || eventId <= 0) {
    return { created: 0, updated: 0, removed: 0 };
  }
  const db = connOrPool || pool;
  const [eventRows] = await db.execute(
    `SELECT id, agency_id, event_type, starts_at, ends_at, timezone, recurrence_json
     FROM company_events
     WHERE id = ?
     LIMIT 1`,
    [eventId]
  );
  const eventRow = eventRows?.[0];
  if (!eventRow) return { created: 0, updated: 0, removed: 0 };

  const desired = desiredOccurrencesFromEventRow(eventRow);
  const desiredKeys = new Set(
    desired.map((d) => `${d.sessionDate}|${new Date(d.startsAt).toISOString()}`)
  );

  const [existingRows] = await db.execute(
    `SELECT id, session_date, starts_at
     FROM company_event_session_dates
     WHERE company_event_id = ?`,
    [eventId]
  );

  let removed = 0;
  for (const row of existingRows || []) {
    const ymd = normalizeDbDateToYmd(row.session_date);
    const startIso = new Date(row.starts_at).toISOString();
    const key = `${ymd}|${startIso}`;
    if (!desiredKeys.has(key)) {
      // eslint-disable-next-line no-await-in-loop
      const [del] = await db.execute(`DELETE FROM company_event_session_dates WHERE id = ?`, [Number(row.id)]);
      removed += Number(del?.affectedRows || 0);
    }
  }

  const [existingAfterDelete] = await db.execute(
    `SELECT id, session_date, starts_at
     FROM company_event_session_dates
     WHERE company_event_id = ?`,
    [eventId]
  );
  const existingByKey = new Map();
  for (const row of existingAfterDelete || []) {
    const key = `${normalizeDbDateToYmd(row.session_date)}|${new Date(row.starts_at).toISOString()}`;
    existingByKey.set(key, Number(row.id));
  }

  let created = 0;
  let updated = 0;
  for (const row of desired) {
    const key = `${row.sessionDate}|${new Date(row.startsAt).toISOString()}`;
    const existingId = existingByKey.get(key);
    if (existingId) {
      // eslint-disable-next-line no-await-in-loop
      await db.execute(
        `UPDATE company_event_session_dates
         SET ends_at = ?, timezone = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [row.endsAt, row.timezone, existingId]
      );
      updated += 1;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await db.execute(
        `INSERT INTO company_event_session_dates
          (company_event_id, session_date, starts_at, ends_at, timezone)
         VALUES (?, ?, ?, ?, ?)`,
        [eventId, row.sessionDate, row.startsAt, row.endsAt, row.timezone]
      );
      created += 1;
    }
  }

  return { created, updated, removed };
}

export async function listProgramSessionsForEvent({ companyEventId, fromDate = null, toDate = null }) {
  const eventId = Number(companyEventId);
  if (!Number.isFinite(eventId) || eventId <= 0) return [];
  let sql = `
    SELECT id, company_event_id, session_date, starts_at, ends_at, timezone,
           join_url, modality, location_label, location_address
    FROM company_event_session_dates
    WHERE company_event_id = ?`;
  const params = [eventId];
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate || ''))) {
    sql += ' AND session_date >= ?';
    params.push(String(fromDate));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(toDate || ''))) {
    sql += ' AND session_date <= ?';
    params.push(String(toDate));
  }
  sql += ' ORDER BY session_date ASC, starts_at ASC, id ASC LIMIT 800';
  const [rows] = await pool.execute(sql, params);
  return rows || [];
}
