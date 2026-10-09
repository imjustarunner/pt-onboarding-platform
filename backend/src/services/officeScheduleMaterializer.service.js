import { withClientSchedulingLock, hasClientSchedulingLock } from './clientSchedulingGuard.service.js';
import { publishOfficeAssignmentEvent } from './officeAssignmentBookingAvailability.service.js';
import { officePlanHasClient, officeYearBoundary, withinOfficeRecordWindow } from '../utils/officeRecordWindow.js';
import { officeBookingAgencyId } from '../utils/officeBookingAgency.js';
import pool from '../config/database.js';
import { attachOfficeSchedulingPolicies } from './officeSchedulingPolicy.service.js';
import { appointmentMode } from '../utils/officeSchedulingPolicy.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import { dayDiffYmd } from './officeSlotSeries.service.js';
import { addMonthsYmd } from '../utils/scheduleRecurrence.js';
import { mysqlDateTimeForDateHour as mysqlDateTimeForDateHourZoned } from '../utils/officeEventDateTime.util.js';
import { utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';

function parseYmdParts(dateStr) {
  const raw = String(dateStr || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  return { y, mo, d };
}

function ymdFromUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeYmd(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizeDateTime(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 19).replace('T', ' ');
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function startOfWeekISO(dateStr) {
  // Returns Sunday of the week for the given YYYY-MM-DD using UTC calendar math.
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  const day = d.getUTCDay(); // 0..6
  d.setUTCDate(d.getUTCDate() - day);
  return ymdFromUtcDate(d);
}

function startOfWeekMonday(dateStr) {
  // Returns Monday of the week for the given YYYY-MM-DD using UTC calendar math.
  // All grid views use Monday as the week anchor, so background jobs (watchdog,
  // approvals) should also use this so their debounce cache keys match the grid's.
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Mon is 1; Sunday needs -6 to reach prior Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return ymdFromUtcDate(d);
}

function addDays(dateStr, days) {
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return ymdFromUtcDate(d);
}

function mysqlDateTimeForDateHour(dateStr, hour24, timeZone) {
  return mysqlDateTimeForDateHourZoned(dateStr, hour24, timeZone);
}

function weekIndexFromAnchor(dateStr, anchorStr) {
  const ap = parseYmdParts(anchorStr);
  const dp = parseYmdParts(dateStr);
  if (!ap || !dp) return 0;
  const a = Date.UTC(ap.y, ap.mo - 1, ap.d);
  const d = Date.UTC(dp.y, dp.mo - 1, dp.d);
  const diffDays = Math.floor((d - a) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

function weekdayIndexFromYmd(dateStr) {
  const p = parseYmdParts(dateStr);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
}

export function isCalendarMonthlyDate(anchor, dateStr) {
  if (!anchor || dateStr < anchor) return false;
  const months = (Number(dateStr.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12
    + Number(dateStr.slice(5, 7)) - Number(anchor.slice(5, 7));
  return addMonthsYmd(anchor, months) === dateStr;
}

export function isAssignmentActiveOnDate(assignment, dateStr) {
  const availableSince = normalizeYmd(assignment.available_since_date);
  if (availableSince && dateStr < availableSince) return false;
  // temporary_until_date is only a hard cutoff for TEMPORARY assignments.
  // Ongoing AVAILABLE weekly/biweekly slots must keep materializing past any
  // historical until-date left over from intake approvals.
  const mode = String(assignment.availability_mode || '').toUpperCase();
  if (mode === 'TEMPORARY') {
    const availableUntil = normalizeYmd(assignment.temporary_until_date);
    if (availableUntil && dateStr > availableUntil) return false;
  }
  // Calendar-month assignments keep their original day, including month-end clamping.
  const freq = String(assignment.assigned_frequency || 'WEEKLY').toUpperCase();
  if (freq === 'MONTHLY' && !Number(assignment.legacy_monthly_four_weeks)) return isCalendarMonthlyDate(availableSince, dateStr);
  if (weekdayIndexFromYmd(dateStr) !== Number(assignment.weekday)) return false;
  if (freq === 'WEEKLY') return true;
  const anchor = normalizeYmd(assignment.available_since_date) || new Date().toISOString().slice(0, 10);
  const wi = weekIndexFromAnchor(dateStr, anchor);
  if (freq === 'BIWEEKLY') return wi % 2 === 0;
  if (freq === 'EVERY_3_WEEKS') return wi % 3 === 0;
  if (freq === 'EVERY_4_WEEKS' || (freq === 'MONTHLY' && Number(assignment.legacy_monthly_four_weeks))) return wi % 4 === 0;
  return true;
}

/** Exported for use by isRoomOpenAt when checking if a standing assignment blocks a slot. */
function planSkippedDates(plan) {
  const raw = plan?.skipped_dates_json;
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { arr = null; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((d) => normalizeYmd(d)).filter(Boolean);
}

function isPlanDateSkipped(plan, dateStr) {
  return planSkippedDates(plan).includes(normalizeYmd(dateStr));
}

function hasExplicitBookingLimits(plan) {
  let context = plan?.session_context_json;
  if (typeof context === 'string') { try { context = JSON.parse(context); } catch { return true; } }
  // Adding tenant metadata must not activate old, previously ignored intake caps.
  return !!(context?.clientId || context?.bookingLimitsExplicit);
}

export function shouldBookOnDate(plan, assignment, dateStr) {
  if (!plan || plan.is_active === 0) return false;
  const start = normalizeYmd(plan.booking_start_date);
  if (!start) return false;
  if (dateStr < start) return false;
  // A patient series requires an explicit renewal after one year. Never roll
  // its clinical records forward merely because the office stays assigned.
  if (officePlanHasClient(plan) && dateStr >= officeYearBoundary(start)) return false;
  // Single-occurrence cancels land here so rematerialize does not resurrect them.
  if (isPlanDateSkipped(plan, dateStr)) return false;
  // Open-ended weekly on an AVAILABLE standing assignment: ignore historical
  // active_until_date values left by the old "weekly × 6" intake approval path.
  const openEndedWeekly =
    String(plan.booked_frequency || '').toUpperCase() === 'WEEKLY'
    && String(assignment?.availability_mode || '').toUpperCase() !== 'TEMPORARY'
    && !hasExplicitBookingLimits(plan);
  const configuredUntil = openEndedWeekly ? null : normalizeYmd(plan.active_until_date);
  if (configuredUntil && dateStr > configuredUntil) return false;

  const freq = String(plan.booked_frequency || '').toUpperCase();
  if (freq === 'WEEKLY') return true;

  if (freq === 'BIWEEKLY') {
    if (String(assignment.assigned_frequency || '').toUpperCase() === 'BIWEEKLY') return true;
    const wi = weekIndexFromAnchor(dateStr, start);
    return wi % 2 === 0;
  }

  if (freq === 'EVERY_3_WEEKS') {
    if (String(assignment.assigned_frequency || '').toUpperCase() === 'EVERY_3_WEEKS') return true;
    const wi = weekIndexFromAnchor(dateStr, start);
    return wi % 3 === 0;
  }

  if (freq === 'EVERY_4_WEEKS') {
    if (String(assignment.assigned_frequency || '').toUpperCase() === 'EVERY_4_WEEKS') return true;
    const wi = weekIndexFromAnchor(dateStr, start);
    return wi % 4 === 0;
  }

  if (freq === 'MONTHLY') return isCalendarMonthlyDate(start, dateStr);

  return false;
}

function bookingOccurrenceNumberForDate(plan, assignment, dateStr) {
  const start = normalizeYmd(plan?.booking_start_date);
  if (!start || dateStr < start) return 0;
  const configuredUntil = normalizeYmd(plan?.active_until_date);
  const upperBound = [dateStr, configuredUntil]
    .filter((x) => String(x || '').length === 10)
    .sort()[0] || dateStr;

  let count = 0;
  for (let d = start; d && d <= upperBound; d = addDays(d, 1)) {
    if (!isAssignmentActiveOnDate(assignment, d)) continue;
    // A cancellation/move consumes its original position; it must not append a replacement session.
    if (!shouldBookOnDate({ ...plan, skipped_dates_json: [] }, assignment, d)) continue;
    count += 1;
  }
  return count;
}

export function shouldBookByCount(plan, assignment, dateStr) {
  // Open-ended weekly AVAILABLE slots ignore occurrence caps from the old intake path.
  const openEndedWeekly =
    String(plan?.booked_frequency || '').toUpperCase() === 'WEEKLY'
    && String(assignment?.availability_mode || '').toUpperCase() !== 'TEMPORARY'
    && !hasExplicitBookingLimits(plan);
  if (openEndedWeekly) return true;
  const maxCountRaw = Number(plan?.booked_occurrence_count || 0);
  if (!Number.isInteger(maxCountRaw) || maxCountRaw <= 0) return true;
  const occurrenceNumber = bookingOccurrenceNumberForDate(plan, assignment, dateStr);
  return occurrenceNumber > 0 && occurrenceNumber <= maxCountRaw;
}

const materializeInFlight = new Map();
const materializeRecent = new Map();
const MATERIALIZE_RECENT_MS = 15000;

export class OfficeScheduleMaterializer {
  static startOfWeekISO(dateStr) {
    return startOfWeekISO(dateStr);
  }

  static startOfWeekMonday(dateStr) {
    return startOfWeekMonday(dateStr);
  }

  static addDays(dateStr, days) {
    return addDays(dateStr, days);
  }

  /**
   * Drop the short-lived materialize read-cache for an office (all weeks).
   * Call this right after writing standing assignments / booking plans so the next
   * grid load re-materializes from the new source-of-truth rows instead of serving
   * a stale cached pass.
   */
  static invalidateOffice(officeLocationId) {
    const officeId = parseInt(officeLocationId, 10);
    if (!officeId) return;
    const prefix = `${officeId}|`;
    for (const key of materializeRecent.keys()) {
      if (key.startsWith(prefix)) materializeRecent.delete(key);
    }
  }

  static async materializeWeek({ officeLocationId, weekStartRaw, createdByUserId, useExactWeekStart = false, force = false }) {
    const officeId = parseInt(officeLocationId, 10);
    const rawWeekStart = normalizeYmd(weekStartRaw);
    const weekStart = useExactWeekStart
      ? rawWeekStart
      : startOfWeekISO(String(rawWeekStart || ''));
    const uid = parseInt(createdByUserId, 10) || 0;
    if (!officeId || !weekStart) return { ok: false, reason: 'invalid_args' };
    const key = `${officeId}|${weekStart}`;
    const now = Date.now();
    let cacheHit = false;
    // `force` bypasses the short-lived read cache so a freshly created/updated assignment
    // always materializes, even if this week was rendered (and cached) seconds earlier.
    if (!force) {
      const recent = materializeRecent.get(key);
      if (recent && (now - recent.at) < MATERIALIZE_RECENT_MS) {
        cacheHit = true;
        return recent.value;
      }
    }
    // Always de-dupe concurrent runs for the same week.
    if (materializeInFlight.has(key) && !hasClientSchedulingLock()) return materializeInFlight.get(key);

    const runner = (async () => {
      const loc = await OfficeLocation.findById(officeId);
      const officeTz = loc?.timezone || 'America/Denver';
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
        .filter(date => withinOfficeRecordWindow(date, officeTz));
      if (!days.length) return { ok: true, upsertedCount: 0, cancelledCount: 0, reason: 'beyond_record_window' };
      const windowStart = mysqlDateTimeForDateHour(weekStart, 0, officeTz) || `${weekStart} 00:00:00`;
      const windowEnd = mysqlDateTimeForDateHour(addDays(weekStart, 7), 0, officeTz) || `${addDays(weekStart, 7)} 00:00:00`;
      let upsertedCount = 0;
      let cancelledCount = 0;

      // Standing assignments + booking plans are the source of truth for assigned_* states.
      const standing = await attachOfficeSchedulingPolicies(await OfficeStandingAssignment.listByOffice(officeId));
      const plans = await OfficeBookingPlan.listActiveByAssignmentIds(standing.map((s) => s.id));
      const planByAssignment = new Map(plans.map((p) => [p.standing_assignment_id, p]));
      const existingEvents = await OfficeEvent.listForOfficeWindow({
        officeLocationId: officeId,
        startAt: windowStart,
        endAt: windowEnd
      });
      const existingBySlot = new Map();
      for (const e of existingEvents || []) {
        const roomId = Number(e.room_id || e.roomId || 0);
        const startAt = normalizeDateTime(e.start_at || e.startAt);
        const endAt = normalizeDateTime(e.end_at || e.endAt);
        if (!roomId || !startAt || !endAt) continue;
        const slotKey = `${roomId}|${startAt}|${endAt}`;
        if (!existingBySlot.has(slotKey)) existingBySlot.set(slotKey, []);
        existingBySlot.get(slotKey).push(e);
      }

      for (const a of standing) {
        for (const date of days) {
          // A policy change must never rewrite historical office occurrences.
          if (date < utcToZonedMysqlWall(new Date(), officeTz).slice(0, 10)) continue;
          // Materialize only on the assignment's configured weekday.
          if (!isAssignmentActiveOnDate(a, date)) continue;
          const startAt = mysqlDateTimeForDateHour(date, a.hour, officeTz);
          const endAt = mysqlDateTimeForDateHour(date, Number(a.hour) + 1, officeTz);
          if ((existingEvents || []).some((ev) => {
            let context = ev.session_context_json || {};
            if (typeof context === 'string') { try { context = JSON.parse(context); } catch { context = {}; } }
            return ev.client_id && String(ev.status).toUpperCase() === 'BOOKED'
              && (context.appointmentId || context.appointmentSeriesId || !ev.standing_assignment_id)
              && Number(ev.room_id) === Number(a.room_id)
              && normalizeDateTime(ev.start_at) < endAt && normalizeDateTime(ev.end_at) > startAt;
          })) continue;
          const slotKey = `${Number(a.room_id || 0)}|${startAt}|${endAt}`;
          const existingRows = existingBySlot.get(slotKey) || [];
          // Patient bookings are changed by explicit booking/cancellation actions.
          // A plan refresh must never cancel clinical history or bypass package policy.
          if (existingRows.some((ev) => ev.client_id && String(ev.status).toUpperCase() === 'BOOKED')) continue;

          const extCount = Number(a.temporary_extension_count || 0);
          const untilStr = normalizeYmd(a.temporary_until_date);
          // After 2 extensions, when date > temporary_until_date, slot falls off (provider must re-request)
          if (a.availability_mode === 'TEMPORARY' && extCount >= 2 && untilStr && date > untilStr) continue;

          // Keep temporary expiry semantics, but surface approved availability as assigned_available.
          const appointmentsOnly = appointmentMode(a, date);
          const baseSlotState = appointmentsOnly ? 'ASSIGNED_AVAILABLE' : 'ASSIGNED_BOOKED';

          const storedPlan = planByAssignment.get(a.id) || null;
          // Automatic reservations stop at cutover. Client appointment series remain intact.
          const plan = appointmentsOnly && !officePlanHasClient(storedPlan) ? null : storedPlan;
          const bookedFromPlan = !!(plan && shouldBookOnDate(plan, a, date) && shouldBookByCount(plan, a, date));
          const slotState = bookedFromPlan ? 'ASSIGNED_BOOKED' : baseSlotState;
          const desiredBookedProviderId = slotState === 'ASSIGNED_BOOKED' ? Number(a.provider_id || 0) : 0;
          const desiredPlanId = bookedFromPlan ? Number(plan?.id || 0) : 0;
          let sessionContext = null;
          if (desiredPlanId && plan?.session_context_json) {
            sessionContext = typeof plan.session_context_json === 'string' ? JSON.parse(plan.session_context_json) : plan.session_context_json;
          }
          if (!sessionContext?.agencyId && a.booking_agency_id) sessionContext = { ...sessionContext, agencyId: Number(a.booking_agency_id) };
          if (!desiredPlanId || !officePlanHasClient(plan)) sessionContext = { ...sessionContext, bookingSource: appointmentsOnly ? 'office_assignment' : 'automatic_office_reservation' };
          const hasMatchingRow = existingRows.some((ev) =>
            String(ev?.status || '').toUpperCase() !== 'CANCELLED'
            && String(ev?.slot_state || '').toUpperCase() === String(slotState || '').toUpperCase()
            && Number(ev?.standing_assignment_id || 0) === Number(a.id || 0)
            && Number(ev?.booking_plan_id || 0) === desiredPlanId
            && Number(ev?.assigned_provider_id || 0) === Number(a.provider_id || 0)
            && Number(ev?.booked_provider_id || 0) === desiredBookedProviderId
            && (!sessionContext?.agencyId || officeBookingAgencyId(ev) === Number(sessionContext.agencyId))
            && (!sessionContext?.bookingSource || (() => {
              try {
                const context = typeof ev.session_context_json === 'string' ? JSON.parse(ev.session_context_json) : ev.session_context_json;
                return context?.bookingSource === sessionContext.bookingSource;
              } catch { return false; }
            })())
            && (!sessionContext?.clientId || Number(ev?.client_id || 0) === Number(sessionContext.clientId))
            && (!sessionContext?.serviceCode || String(ev?.service_code || '') === String(sessionContext.serviceCode))
            && (!sessionContext?.packageEntitlementId || !!ev?.session_context_json)
          );
          if (hasMatchingRow) continue;

          await withClientSchedulingLock([sessionContext?.clientId], async () => {
            const sessionEvent = await OfficeEvent.upsertSlotState({
              allowAutomaticReservationDowngrade: appointmentsOnly,
              officeLocationId: officeId,
              roomId: a.room_id,
              startAt,
              endAt,
              slotState,
              standingAssignmentId: a.id,
              // Skipped (unbooked) dates keep the assignment but must not re-link the booking plan.
              bookingPlanId: desiredPlanId || null,
              recurrenceGroupId: a.recurrence_group_id || null,
              assignedProviderId: a.provider_id,
              bookedProviderId: desiredBookedProviderId || null,
              createdByUserId: uid || 1,
              // Never resurrect explicit cancellations — occurrence cancels + forfeits must stick.
              replaceCancelled: false
            });
            if (sessionEvent?.id && sessionContext?.bookingSource && !sessionContext?.clientId) {
              await pool.execute("UPDATE office_events SET session_context_json = JSON_SET(COALESCE(session_context_json, JSON_OBJECT()), '$.agencyId', ?, '$.bookingSource', ?) WHERE id = ? AND client_id IS NULL AND clinical_session_id IS NULL", [sessionContext.agencyId || null, sessionContext.bookingSource || 'office_assignment', sessionEvent.id]);
            }
            if (sessionEvent?.id && sessionContext?.clientId) {
              await pool.execute(
                `UPDATE office_events SET client_id = ?, appointment_type_code = ?, appointment_subtype_code = ?,
                 service_code = ?, modality = ?, service_location_id = ?, session_context_json = ?
                 WHERE id = ? AND clinical_session_id IS NULL AND (client_id IS NULL OR client_id = ?)`,
                [sessionContext.clientId, sessionContext.appointmentTypeCode || 'SESSION', sessionContext.appointmentSubtypeCode || null,
                  sessionContext.serviceCode || null, sessionContext.modality || null, sessionContext.serviceLocationId || null, JSON.stringify(sessionContext),
                  sessionEvent.id, sessionContext.clientId]
              );
            }
            await publishOfficeAssignmentEvent(a, sessionEvent);
            upsertedCount += 1;
          }).catch(error => {
            // Pending termination owns these dates; render other slots while its
            // durable cleanup retries, without creating more client reservations.
            if (error.code !== 'CLIENT_TERMINATION_PENDING') throw error;
          });
        }
      }

      // Quiet by default — this runs for many offices/weeks on boot. Set DEBUG_OFFICE_MATERIALIZE=1 to log all.
      if (
        upsertedCount > 0 ||
        cancelledCount > 0 ||
        process.env.DEBUG_OFFICE_MATERIALIZE === '1'
      ) {
        console.info('[materializeWeek]', JSON.stringify({
          officeLocationId: officeId,
          weekStart,
          cacheHit,
          upsertedCount,
          cancelledCount
        }));
      }

      return { ok: true, officeLocationId: officeId, weekStart, days, upsertedCount, cancelledCount, cacheHit };
    })();

    materializeInFlight.set(key, runner);
    try {
      const value = await runner;
      materializeRecent.set(key, { at: Date.now(), value });
      return value;
    } finally {
      if (materializeInFlight.get(key) === runner) materializeInFlight.delete(key);
    }
  }
}

export default OfficeScheduleMaterializer;
