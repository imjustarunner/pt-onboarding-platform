/**
 * officeSlotSeries.service.js
 *
 * Shared utilities for validating, generating, and describing office slot
 * recurrence series. Used by both the legacy availability controller and the
 * newer officeSchedule controller so that recurrence logic stays in one place.
 */

import {
  normalizeOfficeRequestRecurrence,
  stepDaysForRecurrence,
  recurrenceLabel,
  generateOccurrenceDates as generateOccurrenceDatesShared,
  isRecurringFrequency,
  addMonthsYmd,
  RECURRING_FREQUENCIES,
  RECURRENCE_ONCE
} from '../utils/scheduleRecurrence.js';
import { mysqlDateTimeForDateHour } from '../utils/officeEventDateTime.util.js';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function normalizeYmd(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toYmd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function addDays(dateLike, days) {
  const d = new Date(dateLike instanceof Date ? dateLike.getTime() : dateLike);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Generate all YYYY-MM-DD occurrence dates for a slot series.
 * Monthly uses same day-of-month; week-based uses exact day steps.
 */
function generateOccurrenceDates({ startDate, recurrence, occurrenceCount }) {
  if (!startDate) return [];
  const normalized = normalizeYmd(startDate);
  if (!normalized) return [];
  // Open-ended weekly series: validate a forward window (12 weeks).
  const count =
    occurrenceCount == null
      ? isRecurringFrequency(recurrence)
        ? 12
        : 1
      : Math.max(1, Number(occurrenceCount || 1));
  if (!isRecurringFrequency(recurrence) || count === 1) {
    return [normalized];
  }
  return generateOccurrenceDatesShared({
    startDate: normalized,
    recurrence,
    occurrenceCount: count
  });
}

// ---------------------------------------------------------------------------
// Pre-flight conflict validation
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Validate that every occurrence in an office slot series is free.
 * Checks both materialised office_events and active standing assignments.
 *
 * @param {object} opts
 * @param {import('mysql2/promise').Pool} opts.pool         MySQL pool
 * @param {number}   opts.providerId         provider being assigned
 * @param {number}   opts.roomId             room being assigned
 * @param {number}   opts.officeLocationId   office location
 * @param {string}   opts.startDate          YYYY-MM-DD of first occurrence
 * @param {number}   opts.weekday            0=Sun … 6=Sat
 * @param {number}   opts.startHour          integer hour (0-23)
 * @param {number}   opts.endHour            integer hour (exclusive)
 * @param {string}   opts.recurrence         ONCE|WEEKLY|BIWEEKLY|EVERY_3_WEEKS|EVERY_4_WEEKS|MONTHLY
 * @param {number}   opts.occurrenceCount
 *
 * @returns {Promise<{ ok: true }|{ ok: false, status: number, error: object }>}
 */
// Read one consistent inventory per review rather than querying every room ×
// hour × recurring date. Re-read on confirmation under the approval lock.
export async function loadOfficeSlotInventory(
  database,
  { roomIds, startAt, endAt }
) {
  const ids = [...new Set(roomIds.map(Number).filter((id) => id > 0))];
  if (!ids.length)
    return { events: [], assignments: [], plans: [], legacy: [] };
  const marks = ids.map(() => '?').join(',');
  const [[events], [assignments], [plans], [legacy]] = await Promise.all([
    database.execute(
      `SELECT e.*,u.first_name,u.last_name,r.label AS room_label,r.room_number
      FROM office_events e JOIN office_rooms r ON r.id=e.room_id
      LEFT JOIN users u ON u.id=COALESCE(e.booked_provider_id,e.assigned_provider_id)
      WHERE e.room_id IN (${marks}) AND e.start_at<? AND e.end_at>?
      AND (e.status IS NULL OR e.status<>'CANCELLED')
      AND (e.status='BOOKED' OR e.slot_state IN ('ASSIGNED_BOOKED','COMPANY_HOLD'))`,
      [...ids, endAt, startAt]
    ),
    database.execute(
      `SELECT a.*,u.first_name,u.last_name,l.name AS office_name FROM office_standing_assignments a
      JOIN users u ON u.id=a.provider_id JOIN office_locations l ON l.id=a.office_location_id
      WHERE a.room_id IN (${marks}) AND a.is_active=TRUE`,
      ids
    ),
    database.execute(
      `SELECT p.* FROM office_booking_plans p JOIN office_standing_assignments a ON a.id=p.standing_assignment_id
      WHERE a.room_id IN (${marks}) AND a.is_active=TRUE AND p.is_active=TRUE ORDER BY p.id DESC`,
      ids
    ),
    database.execute(
      `SELECT a.*,u.first_name,u.last_name FROM office_room_assignments a LEFT JOIN users u ON u.id=a.assigned_user_id
      WHERE a.room_id IN (${marks}) AND a.start_at<? AND (a.end_at IS NULL OR a.end_at>?)`,
      [...ids, endAt, startAt]
    )
  ]);
  return { events, assignments, plans, legacy };
}
async function validateOfficeSlotSeries({
  pool,
  providerId,
  roomId,
  officeLocationId,
  startDate,
  weekday,
  startHour,
  endHour,
  recurrence,
  occurrenceCount,
  officeTimeZone = null,
  inventory = null,
  occurrenceDates: explicitDates = null
}) {
  const dates =
    explicitDates ||
    generateOccurrenceDates({ startDate, recurrence, occurrenceCount });
  if (
    !dates.length ||
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    endHour <= startHour ||
    startHour < 0 ||
    endHour > 24
  )
    return {
      ok: false,
      status: 400,
      error: {
        message: 'Choose valid dates and a whole-hour office time range.'
      }
    };
  let timezone = officeTimeZone;
  if (!timezone) {
    const [[office]] = await pool.execute(
      'SELECT timezone FROM office_locations WHERE id=? LIMIT 1',
      [officeLocationId]
    );
    timezone = office?.timezone || 'America/Denver';
  }
  const { toMysqlUtcDateTime } = await import(
    '../utils/officeEventDateTime.util.js'
  );
  const { isAssignmentActiveOnDate, shouldBookOnDate, shouldBookByCount } =
    await import('./officeScheduleMaterializer.service.js');
  const data =
    inventory ||
    (await loadOfficeSlotInventory(pool, {
      roomIds: [roomId],
      startAt: mysqlDateTimeForDateHour(dates[0], startHour, timezone),
      endAt: mysqlDateTimeForDateHour(dates.at(-1), endHour, timezone)
    }));
  const inRoom = (row) => Number(row.room_id) === Number(roomId);
  const otherProvider = (row) =>
    Number(
      row.booked_provider_id ||
        row.assigned_provider_id ||
        row.provider_id ||
        row.assigned_user_id ||
        row.user_id ||
        0
    ) !== Number(providerId);
  const overlaps = (row, start, end) =>
    toMysqlUtcDateTime(row.start_at) < end &&
    (!row.end_at || toMysqlUtcDateTime(row.end_at) > start);
  const conflict = (row, date, index, hour, plan = false) => ({
    ok: false,
    status: 409,
    error: {
      message: `Cannot approve — this room is reserved by ${[row.first_name, row.last_name].filter(Boolean).join(' ') || 'another provider'} on ${date} at ${hour}:00 (${timezone})${plan ? ' in the recurring booking plan' : ''}. Choose a different room.`,
      blockedDate: date,
      blockedOccurrence: index + 1,
      blockingProvider:
        [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
      missingMaterializedEvent: plan
    }
  });
  for (let i = 0; i < dates.length; i++)
    for (let hour = startHour; hour < endHour; hour++) {
      const date = dates[i],
        start = mysqlDateTimeForDateHour(date, hour, timezone),
        end = mysqlDateTimeForDateHour(date, hour + 1, timezone);
      if (!start || !end)
        return {
          ok: false,
          status: 400,
          error: {
            message: 'This office time cannot be resolved in its timezone.'
          }
        };
      const event = data.events.find(
        (row) => inRoom(row) && otherProvider(row) && overlaps(row, start, end)
      );
      if (event) return conflict(event, date, i, hour);
      const legacy = data.legacy.find(
        (row) => inRoom(row) && otherProvider(row) && overlaps(row, start, end)
      );
      if (legacy) return conflict(legacy, date, i, hour);
      for (const assignment of data.assignments.filter(
        (row) => inRoom(row) && otherProvider(row) && Number(row.hour) === hour
      )) {
        if (!isAssignmentActiveOnDate(assignment, date)) continue;
        const plan = data.plans.find(
          (p) => Number(p.standing_assignment_id) === Number(assignment.id)
        );
        if (
          plan &&
          shouldBookOnDate(plan, assignment, date) &&
          shouldBookByCount(plan, assignment, date)
        )
          return conflict(assignment, date, i, hour, true);
      }
    }
  return { ok: true };
}

function dayDiffYmd(startYmd, endYmd) {
  const s = normalizeYmd(startYmd);
  const e = normalizeYmd(endYmd);
  if (!s || !e) return NaN;
  const sm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const em = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!sm || !em) return NaN;
  const sMs = Date.UTC(Number(sm[1]), Number(sm[2]) - 1, Number(sm[3]));
  const eMs = Date.UTC(Number(em[1]), Number(em[2]) - 1, Number(em[3]));
  return Math.floor((eMs - sMs) / 86400000);
}

export {
  normalizeYmd,
  toYmd,
  addDays,
  addMonthsYmd,
  dayDiffYmd,
  normalizeOfficeRequestRecurrence,
  stepDaysForRecurrence,
  recurrenceLabel,
  generateOccurrenceDates,
  validateOfficeSlotSeries,
  isRecurringFrequency,
  RECURRING_FREQUENCIES,
  RECURRENCE_ONCE
};
