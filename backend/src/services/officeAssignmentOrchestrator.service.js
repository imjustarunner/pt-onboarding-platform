/**
 * Canonical office assignment pipeline:
 *   office_standing_assignments (+ optional office_booking_plans)
 *     → OfficeScheduleMaterializer → office_events
 *
 * All new assignment writes should go through this module so approval paths,
 * admin assign, and one-time bookings share one source of truth.
 */

import pool from '../config/database.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import {
  normalizeYmd,
  addDays,
  stepDaysForRecurrence,
  normalizeOfficeRequestRecurrence
} from './officeSlotSeries.service.js';

function parseYmdParts(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

function weekdayIndexFromYmd(dateStr) {
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
}

function mysqlDateTimeForDateHour(dateStr, hour24) {
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  const base = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  const totalHours = Number(hour24 || 0);
  const dayOffset = Math.floor(totalHours / 24);
  const normalizedHour = ((totalHours % 24) + 24) % 24;
  base.setUTCDate(base.getUTCDate() + dayOffset);
  const y = base.getUTCFullYear();
  const mo = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d} ${String(normalizedHour).padStart(2, '0')}:00:00`;
}

/**
 * Materialize N weeks starting from the Monday anchor of startDateYmd.
 */
async function materializeOfficeWeeks({
  officeLocationId,
  startDateYmd,
  createdByUserId,
  weeks = 12
}) {
  const startWeek = OfficeScheduleMaterializer.startOfWeekMonday(startDateYmd);
  if (!startWeek) return;
  for (let i = 0; i < weeks; i++) {
    const weekStart = OfficeScheduleMaterializer.addDays(startWeek, i * 7);
    // eslint-disable-next-line no-await-in-loop
    await OfficeScheduleMaterializer.materializeWeek({
      officeLocationId,
      weekStartRaw: weekStart,
      createdByUserId,
      useExactWeekStart: true,
      force: true
    });
  }
}

/**
 * Map recurrence + occurrence count to standing-assignment and materialization params.
 */
function resolveRecurrenceParams({ recurrenceRaw, occurrenceCountRaw, startDateYmd }) {
  const requestRecurrence = normalizeOfficeRequestRecurrence({
    recurrenceRaw,
    occurrenceCountRaw
  });
  const recurrenceName = String(requestRecurrence.recurrence || 'ONCE').toUpperCase();
  const rawCount = requestRecurrence.occurrenceCount;
  const occurrenceCount = rawCount == null
    ? null
    : Math.max(1, Number(rawCount || 1));
  const startDate = normalizeYmd(startDateYmd) || normalizeYmd(new Date());
  const stepDays = stepDaysForRecurrence(recurrenceName);
  // Open-ended weekly: no temporary_until / active_until cutoff.
  // Finite series (ONCE / explicit count / biweekly / monthly): compute until date.
  let untilDate = null;
  if (recurrenceName === 'ONCE') {
    untilDate = startDate;
  } else if (occurrenceCount != null) {
    const lastOccurrenceOffsetDays = Math.max(0, occurrenceCount - 1) * stepDays;
    untilDate = toYmdSafe(addDays(new Date(startDate), lastOccurrenceOffsetDays));
  }

  const assignedFrequency = recurrenceName === 'BIWEEKLY' ? 'BIWEEKLY' : 'WEEKLY';
  const bookingFrequency = recurrenceName === 'BIWEEKLY' ? 'BIWEEKLY'
    : recurrenceName === 'MONTHLY' ? 'MONTHLY'
      : 'WEEKLY';
  const materializeWeeks = recurrenceName === 'BIWEEKLY' ? 12
    : recurrenceName === 'MONTHLY' ? Math.min(52, (occurrenceCount || 6) * 5)
      : recurrenceName === 'ONCE' ? 1 : 12;

  return {
    recurrenceName,
    occurrenceCount,
    startDate,
    untilDate,
    assignedFrequency,
    bookingFrequency,
    materializeWeeks
  };
}

function toYmdSafe(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Upsert an active booking plan and rematerialize so ASSIGNED_BOOKED appears on the grid.
 */
async function upsertBookingPlanAndMaterialize({
  standingAssignmentId,
  officeLocationId,
  bookedFrequency,
  bookingStartDate,
  activeUntilDate = null,
  bookedOccurrenceCount = null,
  createdByUserId,
  bookingOrigin = 'user',
  materializeWeeks = 6
}) {
  await OfficeBookingPlan.upsertActive({
    standingAssignmentId,
    bookedFrequency,
    bookingStartDate,
    activeUntilDate,
    bookedOccurrenceCount,
    createdByUserId,
    bookingOrigin
  });
  OfficeScheduleMaterializer.invalidateOffice(officeLocationId);
  await materializeOfficeWeeks({
    officeLocationId,
    startDateYmd: bookingStartDate,
    createdByUserId,
    weeks: materializeWeeks
  });
}

/**
 * Create or update temporary standing assignments for a single calendar date + hour block.
 * Used for one-time admin assigns and legacy one-time request approvals.
 */
async function assignOneTimeOfficeBlock({
  officeLocationId,
  roomId,
  providerId,
  dateYmd,
  startHour,
  endHour,
  createdByUserId,
  markBooked = false,
  bookedOccurrenceCount = 1,
  eventExtras = null
}) {
  const date = normalizeYmd(dateYmd);
  if (!date) throw new Error('Invalid dateYmd');
  const weekday = weekdayIndexFromYmd(date);
  if (!Number.isInteger(weekday)) throw new Error('Invalid weekday for date');

  const standingAssignments = [];
  const createdEvents = [];

  for (let h = startHour; h < endHour; h++) {
    // eslint-disable-next-line no-await-in-loop
    let standing = await OfficeStandingAssignment.create({
      officeLocationId,
      roomId,
      providerId,
      weekday,
      hour: h,
      assignedFrequency: 'WEEKLY',
      createdByUserId
    });
    // eslint-disable-next-line no-await-in-loop
    standing = await OfficeStandingAssignment.update(standing.id, {
      availability_mode: 'TEMPORARY',
      available_since_date: date,
      temporary_until_date: date,
      last_two_week_confirmed_at: new Date()
    }) || standing;

    if (markBooked) {
      // eslint-disable-next-line no-await-in-loop
      await OfficeBookingPlan.upsertActive({
        standingAssignmentId: standing.id,
        bookedFrequency: 'WEEKLY',
        bookingStartDate: date,
        activeUntilDate: date,
        bookedOccurrenceCount,
        createdByUserId,
        bookingOrigin: 'admin'
      });
    }

    const slotStartAt = mysqlDateTimeForDateHour(date, h);
    const slotEndAt = mysqlDateTimeForDateHour(date, h + 1);
    const slotState = markBooked ? 'ASSIGNED_BOOKED' : 'ASSIGNED_AVAILABLE';
    const extras = eventExtras && typeof eventExtras === 'object' ? eventExtras : {};

    // eslint-disable-next-line no-await-in-loop
    const event = await OfficeEvent.upsertSlotState({
      officeLocationId,
      roomId,
      startAt: slotStartAt,
      endAt: slotEndAt,
      slotState,
      standingAssignmentId: standing.id,
      bookingPlanId: null,
      assignedProviderId: providerId,
      bookedProviderId: markBooked ? providerId : null,
      createdByUserId,
      replaceCancelled: true,
      notes: extras.notes || null
    });
    standingAssignments.push(standing);
    if (event?.id) createdEvents.push(event);
  }

  OfficeScheduleMaterializer.invalidateOffice(officeLocationId);
  await materializeOfficeWeeks({
    officeLocationId,
    startDateYmd: date,
    createdByUserId,
    weeks: 1
  });

  return { standingAssignments, events: createdEvents };
}

/**
 * Best-effort cleanup of orphan legacy office_room_assignments that no longer have
 * live conflicting events (migration aid — new writes no longer create these rows).
 */
async function cleanupOrphanLegacyAssignment({ roomId, startAt, endAt, assignedUserId }) {
  try {
    const [aRows] = await pool.execute(
      `SELECT id
       FROM office_room_assignments
       WHERE room_id = ?
         AND start_at < ?
         AND (end_at IS NULL OR end_at > ?)
       LIMIT 1`,
      [roomId, endAt, startAt]
    );
    if (!(aRows || []).length) return false;
    const legacyAssignmentId = Number(aRows[0]?.id || 0);
    const [activeEventRows] = await pool.execute(
      `SELECT 1
       FROM office_events
       WHERE room_id = ?
         AND start_at < ?
         AND end_at > ?
         AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
         AND (assigned_provider_id IS NULL OR assigned_provider_id <> ?)
         AND (booked_provider_id   IS NULL OR booked_provider_id   <> ?)
       LIMIT 1`,
      [roomId, endAt, startAt, assignedUserId, assignedUserId]
    );
    if (!(activeEventRows || []).length && legacyAssignmentId) {
      await pool.execute(`DELETE FROM office_room_assignments WHERE id = ?`, [legacyAssignmentId]);
      return true;
    }
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  return false;
}

export {
  weekdayIndexFromYmd,
  mysqlDateTimeForDateHour,
  materializeOfficeWeeks,
  resolveRecurrenceParams,
  upsertBookingPlanAndMaterialize,
  assignOneTimeOfficeBlock,
  cleanupOrphanLegacyAssignment
};
