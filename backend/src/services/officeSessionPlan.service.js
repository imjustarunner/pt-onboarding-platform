import pool from '../config/database.js';
import BookingPackage from '../models/BookingPackage.model.js';
import OfficeScheduleMaterializer, { shouldBookOnDate, shouldBookByCount, isAssignmentActiveOnDate } from './officeScheduleMaterializer.service.js';
import { ensureAppointmentContext } from './appointmentContext.service.js';
import { assertAppointmentClients } from './appointmentClinicalLink.service.js';
import { mysqlDateTimeForDateHour } from '../utils/officeEventDateTime.util.js';

const ymd = (v) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10);
const fail = (message) => Object.assign(new Error(message), { status: 409 });

export function officeSessionPlanDates(plan, assignment) {
  const start = ymd(plan.booking_start_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw fail('The office booking plan needs a valid start date');
  const dates = [];
  for (let i = 0; i <= 365; i += 1) {
    const date = OfficeScheduleMaterializer.addDays(start, i);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() !== Number(assignment.weekday)) continue;
    if (isAssignmentActiveOnDate(assignment, date) && shouldBookOnDate(plan, assignment, date) && shouldBookByCount(plan, assignment, date)) dates.push(date);
  }
  return dates;
}

/** Explicit booking writes finalize the entire bounded series, including its package reservations. */
export async function saveOfficeSessionPlanContext(planId, context, actorUserId = null) {
  const conn = await pool.getConnection();
  const lockName = `office_session_plan:${Number(planId)}`;
  let locked = false;
  const linkedEventIds = [];
  try {
    const [[lock]] = await conn.execute('SELECT GET_LOCK(?, 8) AS acquired', [lockName]);
    locked = Number(lock?.acquired) === 1;
    if (!locked) throw fail('This series is being updated. Refresh before retrying.');
    const [[plan]] = await conn.execute('SELECT * FROM office_booking_plans WHERE id = ?', [planId]);
    if (!plan) throw fail('Office booking plan not found');
    const [[assignment]] = await conn.execute('SELECT a.*, l.timezone FROM office_standing_assignments a JOIN office_locations l ON l.id = a.office_location_id WHERE a.id = ?', [plan.standing_assignment_id]);
    if (!assignment) throw fail('Office assignment not found');
    await assertAppointmentClients(context.agencyId, [{ clientId: context.clientId }]);
    const candidate = { ...plan, session_context_json: context };
    const dates = officeSessionPlanDates(candidate, assignment);
    if (!dates.length) throw fail('This office plan has no bookable occurrences');
    const [existing] = await conn.execute(
      `SELECT a.id, a.package_entitlement_id, e.start_at, e.client_id FROM appointments a
       JOIN office_events e ON e.id = a.office_event_id WHERE e.booking_plan_id = ? AND e.standing_assignment_id = ? AND a.status IN ('scheduled', 'confirmed')`, [planId, plan.standing_assignment_id]);
    const requiredStarts = new Set(dates.map((date) => mysqlDateTimeForDateHour(date, assignment.hour, assignment.timezone)));
    const eventStart = (a) => a.start_at instanceof Date ? a.start_at.toISOString().slice(0, 19).replace('T', ' ') : String(a.start_at);
    if (existing.some((a) => !requiredStarts.has(eventStart(a)))) throw fail('Cancel the excluded future sessions before shortening or replacing this booked series');
    if (existing.some((a) => Number(a.package_entitlement_id || 0) !== Number(context.packageEntitlementId || 0)
        || Number(a.client_id) !== Number(context.clientId))) throw fail('Cancel the existing client sessions before changing this series client or package');
    if (context.packageEntitlementId) {
      if (!Number(plan.booked_occurrence_count)) throw fail('Choose an occurrence count for a package-backed office series');
      const entitlement = await BookingPackage.findEntitlementById(context.packageEntitlementId, context.agencyId);
      const alreadyReserved = existing.filter((a) => requiredStarts.has(eventStart(a))).length;
      const needed = dates.length - alreadyReserved;
      if (!entitlement || Number(entitlement.clientId) !== Number(context.clientId)
          || (needed > 0 && (entitlement.status !== 'ACTIVE' || Number(entitlement.sessionsRemaining) < needed))) {
        throw fail(`The selected package needs ${needed} available sessions for this office series`);
      }
    }
    await conn.execute('UPDATE office_booking_plans SET session_context_json = ? WHERE id = ?', [JSON.stringify(context), planId]);
    // Older approval code may already have materialized an open-ended horizon.
    // Release only anonymous placeholders beyond the selected patient series.
    await conn.execute(`UPDATE office_events SET status = 'RELEASED', slot_state = 'ASSIGNED_AVAILABLE', booked_provider_id = NULL, booking_plan_id = NULL
      WHERE booking_plan_id = ? AND client_id IS NULL AND clinical_session_id IS NULL
      AND start_at NOT IN (${[...requiredStarts].map(() => '?').join(',')})`, [planId, ...requiredStarts]);
    OfficeScheduleMaterializer.invalidateOffice(assignment.office_location_id);
    for (const week of new Set(dates.map((date) => OfficeScheduleMaterializer.startOfWeekMonday(date)))) {
      await OfficeScheduleMaterializer.materializeWeek({ officeLocationId: assignment.office_location_id, weekStartRaw: week,
        createdByUserId: actorUserId || plan.created_by_user_id, force: true, useExactWeekStart: true });
    }
    for (const date of dates) {
      const start = mysqlDateTimeForDateHour(date, assignment.hour, assignment.timezone);
      const [[event]] = await conn.execute(`SELECT id FROM office_events WHERE booking_plan_id = ? AND start_at = ? AND status = 'BOOKED'`, [planId, start]);
      if (!event) throw fail(`The office occurrence on ${date} could not be booked`);
      await ensureAppointmentContext({ officeEventId: event.id, agencyId: context.agencyId, clientId: context.clientId,
        sessionContext: context, actorUserId: actorUserId || plan.created_by_user_id });
      linkedEventIds.push(Number(event.id));
    }
    return { linkedEventIds };
  } catch (error) {
    error.bookingPlanId = Number(planId);
    error.linkedEventIds = linkedEventIds;
    if (linkedEventIds.length) error.message = `Office series ${planId} was partially linked. Reopen this series to retry; do not create another booking. ${error.message}`;
    throw error;
  } finally {
    try { if (locked) await conn.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
    finally { conn.release(); }
  }
}
