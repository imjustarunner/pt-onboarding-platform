import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { mysqlDateTimeForDateHour } from '../utils/officeEventDateTime.util.js';
import { utcDateToZonedParts } from '../utils/zonedWallTime.util.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';

const fail = message => Object.assign(new Error(message), { status: 409 });
const utc = value => value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T').replace(/Z$/, '')}Z`);
const localDate = (value, zone) => {
  const p = utcDateToZonedParts(utc(value), zone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/** Release only the selected hourly assignment. Never delete history or a client appointment. */
export async function releaseOfficeReservation({ assignmentId = null, eventId = null, date = null,
  scope = 'occurrence', keepAssigned = false, actorUserId, canManage = false, officeLocationId }) {
  if (!['occurrence', 'future'].includes(scope)) throw fail('Choose one occurrence or this time and future occurrences.');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let event = null;
    if (eventId) {
      [[event]] = await conn.execute('SELECT * FROM office_events WHERE id = ? FOR UPDATE', [eventId]);
      if (!event || Number(event.office_location_id) !== Number(officeLocationId)) throw fail('Office occurrence not found.');
      assignmentId = event.standing_assignment_id || null;
    }
    let assignment = null;
    if (assignmentId) {
      [[assignment]] = await conn.execute('SELECT * FROM office_standing_assignments WHERE id = ? FOR UPDATE', [assignmentId]);
      if (!assignment || Number(assignment.office_location_id) !== Number(officeLocationId)) throw fail('Office assignment not found.');
    }
    const providerId = Number(event?.booked_provider_id || event?.assigned_provider_id || assignment?.provider_id);
    if (!providerId || (!canManage && providerId !== Number(actorUserId))) throw Object.assign(new Error('Access denied'), { status: 403 });
    if (scope === 'future' && (!assignment || Number(assignment.provider_id) !== providerId)) throw fail('This borrowed or independent occurrence cannot release someone else’s series. Choose this occurrence only.');
    const [[office]] = await conn.execute('SELECT timezone FROM office_locations WHERE id = ?', [officeLocationId]);
    const zone = office?.timezone || 'America/Denver';
    const today = localDate(new Date(), zone);
    const selectedDate = event ? localDate(event.start_at, zone) : (date || today);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) || new Date(`${selectedDate}T12:00:00Z`).toISOString().slice(0, 10) !== selectedDate || selectedDate < today) throw fail('Historical office reservations must be preserved. Choose today or a future date.');
    if (!event && scope === 'occurrence' && new Date(`${selectedDate}T12:00:00Z`).getUTCDay() !== Number(assignment?.weekday)) throw fail('The date does not match this assignment’s weekday.');
    const startAt = event?.start_at || mysqlDateTimeForDateHour(selectedDate, scope === 'future' ? 0 : assignment.hour, zone);
    let events;
    if (scope === 'future') {
      [events] = await conn.execute("SELECT * FROM office_events WHERE standing_assignment_id = ? AND start_at >= ? AND (status IS NULL OR status <> 'CANCELLED') FOR UPDATE", [assignmentId, startAt]);
    } else if (event) events = [event];
    else {
      [events] = await conn.execute('SELECT * FROM office_events WHERE room_id = ? AND start_at = ? FOR UPDATE', [assignment.room_id, startAt]);
      if (events.some(row => Number(row.standing_assignment_id) !== Number(assignmentId))) throw fail('Someone else now holds this occurrence. Refresh the calendar.');
    }
    const ids = events.map(row => Number(row.id));
    if (events.some(row => row.client_id || row.clinical_session_id || row.billing_context_id || row.note_context_id)) throw fail('This time has a client session or documentation. Reschedule or cancel the appointment first; the office reservation has been kept.');
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      const [appointments] = await conn.execute(`SELECT id FROM appointments WHERE office_event_id IN (${ph}) LIMIT 1 FOR UPDATE`, ids);
      const [clinical] = await clinicalPool.execute(`SELECT id FROM clinical_sessions WHERE office_event_id IN (${ph}) LIMIT 1`, ids);
      if (appointments.length || clinical.length) throw fail('A client appointment is attached. Handle that appointment first; no office time was released.');
    }
    if (assignmentId) {
      const [plans] = await conn.execute('SELECT id, skipped_dates_json, session_context_json, booked_occurrence_count, active_until_date FROM office_booking_plans WHERE standing_assignment_id = ? AND is_active = TRUE FOR UPDATE', [assignmentId]);
      for (const plan of plans) {
        if (scope === 'occurrence') {
          const skipped = typeof plan.skipped_dates_json === 'string' ? JSON.parse(plan.skipped_dates_json) : (plan.skipped_dates_json || []);
          await conn.execute('UPDATE office_booking_plans SET skipped_dates_json = ? WHERE id = ?', [JSON.stringify([...new Set([...skipped, selectedDate])]), plan.id]);
        } else {
          const context = typeof plan.session_context_json === 'string' ? JSON.parse(plan.session_context_json) : (plan.session_context_json || {});
          const explicit = context.bookingLimitsExplicit === true || !!context.clientId;
          const existingEnd = plan.active_until_date instanceof Date ? plan.active_until_date.toISOString().slice(0, 10) : String(plan.active_until_date || '').slice(0, 10);
          const cutoff = addDaysYmd(selectedDate, -1);
          const until = explicit && existingEnd && existingEnd < cutoff ? existingEnd : cutoff;
          await conn.execute('UPDATE office_booking_plans SET active_until_date = ?, booked_occurrence_count = ?, session_context_json = ?, is_active = IF(? <= ?, FALSE, is_active) WHERE id = ?',
            [until, explicit ? (plan.booked_occurrence_count || null) : null, JSON.stringify({ ...context, bookingLimitsExplicit: true }), selectedDate, today, plan.id]);
        }
      }
      if (scope === 'future' && !keepAssigned) {
        // A future-dated release preserves all earlier occurrences and their history.
        await conn.execute("UPDATE office_standing_assignments SET availability_mode = 'TEMPORARY', temporary_until_date = ?, is_active = IF(? <= ?, FALSE, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = ?", [addDaysYmd(selectedDate, -1), selectedDate, today, assignmentId]);
      }
    }
    if (!ids.length && scope === 'occurrence' && assignment) {
      // A cancellation marker prevents lazy materialization from bringing this day back.
      const [created] = await conn.execute(`INSERT INTO office_events (office_location_id, room_id, standing_assignment_id, assigned_provider_id, start_at, end_at, status, slot_state, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [officeLocationId, assignment.room_id, assignmentId, providerId, startAt,
        mysqlDateTimeForDateHour(selectedDate, Number(assignment.hour) + 1, zone), keepAssigned ? 'RELEASED' : 'CANCELLED', keepAssigned ? 'ASSIGNED_AVAILABLE' : null, actorUserId]);
      ids.push(Number(created.insertId));
    } else if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      await conn.execute(`UPDATE office_events SET status = ?, slot_state = ?, booked_provider_id = NULL, booking_plan_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id IN (${ph})`, [keepAssigned ? 'RELEASED' : 'CANCELLED', keepAssigned ? 'ASSIGNED_AVAILABLE' : null, ...ids]);
      for (const table of ['provider_virtual_slot_availability', 'provider_in_person_slot_availability']) {
        await conn.execute(`UPDATE ${table} SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE source_event_id IN (${ph})`, ids);
      }
    }
    await conn.commit();
    return { ok: true, scope, keepAssigned: scope === 'occurrence' || keepAssigned, eventIds: ids, standingAssignmentId: assignmentId };
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
