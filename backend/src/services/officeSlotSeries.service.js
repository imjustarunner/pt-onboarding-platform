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
  const count = occurrenceCount == null
    ? (isRecurringFrequency(recurrence) ? 12 : 1)
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
  officeTimeZone = null
}) {
  const occurrenceDates = generateOccurrenceDates({ startDate, recurrence, occurrenceCount });

  let officeTz = String(officeTimeZone || '').trim() || null;
  if (!officeTz && officeLocationId) {
    try {
      const [tzRows] = await pool.execute(
        `SELECT timezone FROM office_locations WHERE id = ? LIMIT 1`,
        [officeLocationId]
      );
      officeTz = String(tzRows?.[0]?.timezone || '').trim() || 'America/Denver';
    } catch {
      officeTz = 'America/Denver';
    }
  }
  officeTz = officeTz || 'America/Denver';

  for (let oi = 0; oi < occurrenceDates.length; oi++) {
    const occDate = occurrenceDates[oi];

    for (let h = startHour; h < endHour; h++) {
      // office_events.start_at/end_at are UTC — never compare wall-digit strings or HOUR()/DAYOFWEEK().
      const startAt = mysqlDateTimeForDateHour(occDate, h, officeTz);
      const endAt = mysqlDateTimeForDateHour(occDate, h + 1, officeTz);
      if (!startAt || !endAt) continue;

      // Check for a concrete office_event blocking THIS occurrence only.
      // Only real bookings / company holds block — not ASSIGNED_AVAILABLE.
      const [evConflicts] = await pool.execute(
        `SELECT e.id, u.first_name, u.last_name, r.label AS room_label, r.room_number
         FROM office_events e
         JOIN office_rooms r ON r.id = e.room_id
         LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id)
         WHERE e.room_id = ?
           AND e.start_at < ?
           AND e.end_at > ?
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           AND COALESCE(e.booked_provider_id, e.assigned_provider_id) != ?
           AND (
             UPPER(COALESCE(e.status, '')) = 'BOOKED'
             OR UPPER(COALESCE(e.slot_state, '')) IN ('ASSIGNED_BOOKED', 'COMPANY_HOLD')
           )
         LIMIT 1`,
        [roomId, endAt, startAt, providerId]
      );
      if (evConflicts?.length) {
        const c = evConflicts[0];
        const roomLabel = c.room_number
          ? `#${c.room_number} ${c.room_label || ''}`.trim()
          : (c.room_label || `Room ${roomId}`);
        const blocker = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'another provider';
        const dateLabel = new Date(occDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
        });
        return {
          ok: false,
          status: 409,
          error: {
            message: `Cannot approve — ${roomLabel} is already booked by ${blocker} on ${dateLabel} at ${DAY_NAMES[weekday] || weekday} ${h}:00. Please choose a different room or start date.`,
            blockedOccurrence: oi + 1,
            blockedDate: occDate,
            blockingProvider: blocker,
            roomLabel
          }
        };
      }

      // Standing conflict: only when THIS occurrence is already booked for the standing owner.
      // Future booked Fridays must not block an open occurrence (biweekly off-week / released day).
      if (officeLocationId) {
        const [saConflicts] = await pool.execute(
          `SELECT a.id, a.provider_id, a.office_location_id, a.availability_mode,
                  a.assigned_frequency, a.available_since_date, a.temporary_until_date,
                  u.first_name, u.last_name, u.role, ol.name AS office_name
           FROM office_standing_assignments a
           JOIN users u ON u.id = a.provider_id
           LEFT JOIN office_locations ol ON ol.id = a.office_location_id
           WHERE a.office_location_id = ?
             AND a.room_id = ?
             AND a.weekday = ?
             AND a.hour = ?
             AND a.is_active = TRUE
             AND a.provider_id != ?
             AND (a.available_since_date IS NULL OR a.available_since_date <= ?)
             AND (
               UPPER(COALESCE(a.availability_mode, '')) <> 'TEMPORARY'
               OR a.temporary_until_date IS NULL
               OR a.temporary_until_date >= ?
             )
           LIMIT 1`,
          [officeLocationId, roomId, weekday, h, providerId, occDate, occDate]
        );
        if (saConflicts?.length) {
          const c = saConflicts[0];
          const staffRoles = new Set([
            'super_admin', 'superadmin', 'admin', 'staff', 'support', 'clinical_practice_assistant'
          ]);
          if (staffRoles.has(String(c.role || '').trim().toLowerCase())) {
            continue;
          }
          const [liveEvents] = await pool.execute(
            `SELECT 1
             FROM office_events
             WHERE room_id = ?
               AND start_at < ?
               AND end_at > ?
               AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
               AND (
                 UPPER(COALESCE(status, '')) = 'BOOKED'
                 OR UPPER(COALESCE(slot_state, '')) IN ('ASSIGNED_BOOKED', 'COMPANY_HOLD')
               )
               AND (
                 standing_assignment_id = ?
                 OR booked_provider_id = ?
                 OR assigned_provider_id = ?
               )
             LIMIT 1`,
            [roomId, endAt, startAt, c.id, c.provider_id, c.provider_id]
          );
          let reservedByPlan = false;
          if (!liveEvents?.length) {
            try {
              // Dynamic import avoids circular load with officeScheduleMaterializer.
              const {
                shouldBookOnDate,
                shouldBookByCount,
                isAssignmentActiveOnDate
              } = await import('./officeScheduleMaterializer.service.js');
              if (isAssignmentActiveOnDate(c, occDate)) {
                const [planRows] = await pool.execute(
                  `SELECT *
                   FROM office_booking_plans
                   WHERE standing_assignment_id = ?
                     AND is_active = TRUE
                   ORDER BY id DESC
                   LIMIT 1`,
                  [c.id]
                );
                const plan = planRows?.[0] || null;
                reservedByPlan = !!(plan && shouldBookOnDate(plan, c, occDate) && shouldBookByCount(plan, c, occDate));
              }
            } catch {
              reservedByPlan = false;
            }
          }
          if (liveEvents?.length || reservedByPlan) {
            const blocker = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'another provider';
            const officeNote = c.office_name ? ` in ${c.office_name}` : '';
            const dateLabel = new Date(occDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
            });
            return {
              ok: false,
              status: 409,
              error: {
                message: reservedByPlan && !liveEvents?.length
                  ? `Cannot approve — ${blocker}${officeNote} has this recurring slot reserved on ${dateLabel} (booking plan), but it is missing from the day grid. Refresh the schedule or rematerialize, then choose another room if needed.`
                  : `Cannot approve — this room/time is already booked by ${blocker}${officeNote} on ${dateLabel}. Please choose a different room.`,
                blockedOccurrence: oi + 1,
                blockedDate: occDate,
                blockingProvider: blocker,
                blockingOffice: c.office_name || null,
                missingMaterializedEvent: !!(reservedByPlan && !liveEvents?.length)
              }
            };
          }
        }
      }
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
