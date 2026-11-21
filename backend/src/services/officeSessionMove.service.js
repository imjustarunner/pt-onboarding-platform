import { randomUUID } from 'node:crypto';
import { shiftedAppointmentWindow } from '../utils/appointmentSeriesMove.js';
import { pendingOfficeWindows,overlappingRequest } from './officeRoomAllocation.service.js';
import { mysqlDateTimeForDateHour, utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';
import { queueOfficeMoveReceipt } from './officeMoveEmail.service.js';
import { publishOfficeAssignmentEvent } from './officeAssignmentBookingAvailability.service.js';
import { legacyOfficeAvailabilityDuplicates } from '../utils/officeLegacyDuplicates.js';
import { retireExpiredOfficeAssignment } from './officeAssignmentExpiry.service.js';
import { standingOfficeConflict, eventOfficeConflict } from '../utils/officeMoveConflict.js';
import pool from '../config/database.js';
import { isOwnEmptyReservation, ownReservationsCover } from '../utils/officeMoveReservation.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { utcDateToZonedParts, clientScheduleInstantToUtcMysql, dateToMysqlUtcDateTime } from '../utils/zonedWallTime.util.js';

const fail = (message) => Object.assign(new Error(message), { status: 409 });
const utc = (value) => value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T').replace(/Z$/, '')}Z`);

export async function officeSeriesFromAppointment(eventId, db = pool, { lock = false } = {}) {
  const [[anchor]] = await db.execute(`SELECT e.booking_plan_id, e.recurrence_group_id, e.standing_assignment_id, e.office_location_id, e.client_id,
    JSON_EXTRACT(e.session_context_json, '$.appointmentMoveDetached') AS detached, a.source AS appointment_source, a.start_at AS session_start_at, a.end_at AS session_end_at, a.provider_user_id, a.agency_id, p.recurrence_series_id
    FROM office_events e JOIN appointments a ON a.office_event_id = e.id
    LEFT JOIN provider_schedule_events p ON p.id = a.provider_schedule_event_id
    WHERE e.id = ? AND a.modality = 'IN_PERSON' LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [eventId]);
  if (!anchor) throw fail('This office occurrence needs a linked appointment.');
  const reservedBooking = !anchor.detached && /^reserved_office_session:[a-f0-9]{32}$/.test(anchor.appointment_source || '');
  const group = !anchor.standing_assignment_id && anchor.recurrence_group_id ? ['e.recurrence_group_id', anchor.recurrence_group_id]
    : reservedBooking ? ['a.source', anchor.appointment_source]
    : anchor.recurrence_series_id ? ['p.recurrence_series_id', anchor.recurrence_series_id]
    : anchor.booking_plan_id ? ['e.booking_plan_id', anchor.booking_plan_id] : null;
  if (!group) throw fail('This session is independent of a client series. Move just this session.');
  const [events] = await db.execute(`SELECT e.*, a.start_at AS session_start_at
    FROM office_events e JOIN appointments a ON a.office_event_id = e.id
    LEFT JOIN provider_schedule_events p ON p.id = a.provider_schedule_event_id
    WHERE ${group[0]} = ? AND e.office_location_id = ? AND a.provider_user_id = ? AND a.agency_id = ?
      AND a.start_at >= ? AND a.status IN ('scheduled', 'confirmed')
      AND a.modality = 'IN_PERSON' AND e.client_id <=> ? AND e.status IN ('BOOKED', 'RELEASED')
      ${reservedBooking && group[0] === 'a.source' ? "AND JSON_EXTRACT(e.session_context_json, '$.appointmentMoveDetached') IS NULL" : ''}
    ORDER BY a.start_at, e.id${lock ? ' FOR UPDATE' : ''}`,
    [group[1], anchor.office_location_id, anchor.provider_user_id, anchor.agency_id, anchor.session_start_at, anchor.client_id ?? null]);
  if (!events.some(event => Number(event.id) === Number(eventId))) throw fail('This session changed. Reopen its appointment before moving the series.');
  return { anchor, events };
}

export async function moveOfficeSessionOccurrence({ eventId, newRoomId, startAt, endAt, timeZone, requireOwnReservation = false,
  actorUserId, reason = '', approvalRequestId = null, futureAppointments = false, expectedEventIds = null }) {
  if (!(utc(startAt).getTime() > Date.now()) || !(utc(endAt) > utc(startAt))) throw fail('Choose a valid future session time');
  const conn = await pool.getConnection();
  let moves;
  try {
    await conn.beginTransaction();
    if (approvalRequestId) await lockMoveApproval(conn, approvalRequestId);
    let detachedGroupId = null;
    if (futureAppointments) {
      const { anchor, events } = await officeSeriesFromAppointment(eventId, conn, { lock: true });
      if (expectedEventIds && (expectedEventIds.length !== events.length
        || events.some(event => !expectedEventIds.includes(Number(event.id))))) {
        throw fail('The series changed after this room request. Submit a new move request.');
      }
      detachedGroupId = anchor.booking_plan_id || anchor.standing_assignment_id ? randomUUID() : (anchor.recurrence_group_id || randomUUID());
      const plan = { originalStartAt: anchor.session_start_at, startAt, endAt, timeZone };
      moves = events.map(event => ({ event, ...shiftedAppointmentWindow(event.session_start_at, plan) }));
      if (moves.some(move => utc(move.startAt).getTime() <= Date.now())) throw fail('This move would place a session in the past.');
      if (utc(startAt) > utc(anchor.session_start_at)) moves.reverse();
    } else {
      const [[event]] = await conn.execute('SELECT * FROM office_events WHERE id = ? FOR UPDATE', [eventId]);
      if (!event) throw fail('Office session not found.');
      moves = [{ event, startAt, endAt }];
    }
    const source = moves.find(move => Number(move.event.id) === Number(eventId)).event;
    const held = await pendingOfficeWindows(conn, { officeId: source.office_location_id, timeZone });
    for (const move of moves) {
      await moveOfficeOccurrenceInTransaction(conn, { ...move, newRoomId, timeZone, held, requireOwnReservation, actorUserId, detachedGroupId });
    }
    if (approvalRequestId) await conn.execute("UPDATE office_booking_requests SET status = 'APPROVED', decided_by_user_id = ?, decided_at = UTC_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP WHERE id = ?", [actorUserId, approvalRequestId]);
    await queueOfficeMoveReceipt(conn, { source, newRoomId, startAt, endAt, scope: futureAppointments ? 'client_series' : 'occurrence', timeZone, reason, actorUserId });
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
  await synchronizeMovedOfficeSessions(moves);
  return moves.map(move => Number(move.event.id));
}

async function moveOfficeOccurrenceInTransaction(conn, { event, newRoomId, startAt, endAt, timeZone, held,
  requireOwnReservation, actorUserId, detachedGroupId }) {
  const eventId = Number(event.id);
  if (!event || !['BOOKED', 'RELEASED'].includes(event.status)) throw fail('Only active office reservations can be moved');
  if (['COMPLETED', 'NO_SHOW', 'CANCELLED', 'CANCELED'].includes(String(event.status_outcome || '').toUpperCase())) throw fail('Completed and canceled sessions cannot be moved');
  const [appointments] = await conn.execute('SELECT id, status FROM appointments WHERE office_event_id = ? FOR UPDATE', [eventId]);
  if (appointments.some((a) => !['scheduled', 'confirmed'].includes(a.status))) throw fail('Completed and canceled sessions cannot be moved');
  const [notes] = await clinicalPool.execute(`SELECT n.id FROM clinical_notes n JOIN clinical_sessions s ON s.id = n.clinical_session_id
    WHERE s.office_event_id = ? AND n.is_deleted = 0 AND n.provider_signed_at IS NOT NULL LIMIT 1`, [eventId]);
  if (notes.length) throw fail('A signed note is attached to this session. Preserve that record and book a new session.');
  const providerId = Number(event.booked_provider_id || event.assigned_provider_id);
  const localStart=utcToZonedMysqlWall(startAt,timeZone), localEnd=utcToZonedMysqlWall(endAt,timeZone);
  if(held.some(p=>p.roomId===Number(newRoomId) && overlappingRequest({startDate:localStart.slice(0,10),startHour:Number(localStart.slice(11,13))+Number(localStart.slice(14,16))/60,endHour:Number(localEnd.slice(11,13))+Number(localEnd.slice(14,16))/60,recurrence:'ONCE'},p))) throw fail('The target office is held by a pending request. Resolve that request first.');
  const [roomConflicts] = await conn.execute(`SELECT e.*, EXISTS(SELECT 1 FROM appointments a WHERE a.office_event_id=e.id) AS has_appointment
    FROM office_events e WHERE room_id = ? AND start_at < ? AND end_at > ?
    AND (status IS NULL OR status <> 'CANCELLED') AND e.id <> ? FOR UPDATE`, [newRoomId, endAt, startAt, eventId]);
  const ownAvailability = roomConflicts.filter(e => isOwnEmptyReservation(e, providerId));
  if (roomConflicts.length !== ownAvailability.length) throw fail('This office is occupied or assigned to another provider. Request an available office before moving the session.');
  if (requireOwnReservation && !ownReservationsCover(ownAvailability, providerId, startAt, endAt)) throw Object.assign(fail('Your room reservation changed. Check the available rooms again.'), { code: 'OFFICE_MOVE_NEEDS_RESERVATION' });
  const [providerConflicts] = await conn.execute(`SELECT id FROM appointments WHERE provider_user_id = ? AND start_at < ? AND end_at > ?
    AND status IN ('scheduled', 'confirmed') AND (office_event_id IS NULL OR office_event_id <> ?) LIMIT 1 FOR UPDATE`, [providerId, endAt, startAt, eventId]);
  if (providerConflicts.length) throw fail('The provider already has a session at that time');
  const [calendarConflicts] = await conn.execute(`SELECT p.id FROM provider_schedule_events p LEFT JOIN appointments a ON a.provider_schedule_event_id = p.id
    WHERE p.provider_id = ? AND p.start_at < ? AND p.end_at > ? AND p.status = 'ACTIVE'
    AND (a.office_event_id IS NULL OR a.office_event_id <> ?) LIMIT 1 FOR UPDATE`, [providerId, endAt, startAt, eventId]);
  if (calendarConflicts.length) throw fail('The provider has a calendar event at that time');
  for (const available of ownAvailability) {
    // Keep the unused edges of a longer room reservation available.
    for (const [from, to] of [[available.start_at, startAt], [endAt, available.end_at]]) {
      if (utc(from) >= utc(to)) continue;
      await conn.execute(`INSERT INTO office_events (office_location_id, room_id, start_at, end_at, status, slot_state, assigned_provider_id, booked_provider_id, source, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [event.office_location_id, newRoomId, from, to, available.status, available.slot_state || null,
        available.assigned_provider_id || null, available.booked_provider_id || null, available.source || null, actorUserId]);
    }
    await conn.execute("UPDATE office_events SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [available.id]);
  }
  if (event.booking_plan_id) {
    const [[plan]] = await conn.execute('SELECT skipped_dates_json FROM office_booking_plans WHERE id = ? FOR UPDATE', [event.booking_plan_id]);
    const skips = typeof plan?.skipped_dates_json === 'string' ? JSON.parse(plan.skipped_dates_json) : (plan?.skipped_dates_json || []);
    const p = utcDateToZonedParts(utc(event.start_at), timeZone);
    const originalDate = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    await conn.execute('UPDATE office_booking_plans SET skipped_dates_json = ? WHERE id = ?', [JSON.stringify([...new Set([...skips, originalDate])]), event.booking_plan_id]);
  }
  await conn.execute(`UPDATE office_events SET room_id = ?, start_at = ?, end_at = ?, standing_assignment_id = NULL, booking_plan_id = NULL,
    recurrence_group_id = ?, assigned_provider_id = ?, google_sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP,
    session_context_json = JSON_SET(COALESCE(session_context_json, JSON_OBJECT()), '$.appointmentMoveDetached', TRUE)
    WHERE id = ?`, [newRoomId, startAt, endAt, detachedGroupId, providerId, eventId]);
  if (event.standing_assignment_id && (Number(newRoomId) !== Number(event.room_id) || utc(startAt).getTime() !== utc(event.start_at).getTime())) {
    await conn.execute(`INSERT INTO office_events (office_location_id, room_id, start_at, end_at, status, standing_assignment_id, assigned_provider_id, created_by_user_id)
      VALUES (?, ?, ?, ?, 'CANCELLED', ?, ?, ?)`, [event.office_location_id, event.room_id, event.start_at, event.end_at, event.standing_assignment_id, providerId, actorUserId]);
  }
  for (const table of ['provider_virtual_slot_availability', 'provider_in_person_slot_availability']) {
    const ids = [eventId, ...ownAvailability.map(row => row.id)];
    await conn.execute(`UPDATE ${table} SET is_active = FALSE WHERE source_event_id IN (${ids.map(() => '?').join(',')})`, ids);
  }
  const detachCalendarSeries = detachedGroupId ? '' : ', p.recurrence_series_id = NULL, p.recurrence_frequency = NULL, p.recurrence_policy = NULL, p.recurrence_index = NULL';
  await conn.execute(`UPDATE provider_schedule_events p JOIN appointments a ON a.provider_schedule_event_id = p.id
    SET p.start_at = ?, p.end_at = ?${detachCalendarSeries}, p.updated_at = CURRENT_TIMESTAMP WHERE a.office_event_id = ?`, [startAt, endAt, eventId]);
  await conn.execute(`UPDATE appointments SET room_id = ?, start_at = ?, end_at = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE office_event_id = ?`, [newRoomId, startAt, endAt, actorUserId, eventId]);
}

async function synchronizeMovedOfficeSessions(moves) {
  try {
    for (const move of moves) {
      await clinicalPool.execute('UPDATE clinical_sessions SET scheduled_start_at = ?, scheduled_end_at = ?, updated_at = CURRENT_TIMESTAMP WHERE office_event_id = ?',
        [move.startAt, move.endAt, move.event.id]);
    }
  } catch (error) {
    throw Object.assign(fail('The office session moved, but clinical times need synchronization. Reopen the affected sessions before documenting.'),
      { code: 'CLINICAL_SCHEDULE_SYNC_REQUIRED', movedEventIds: moves.map((move) => move.event.id) });
  }
}

export function movedOfficeWindow(event, { oldWeekday, newWeekday, newHour, timeZone }) {
  const start = utc(event.start_at);
  const end = utc(event.end_at);
  const p = utcDateToZonedParts(start, timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  const date = addDaysYmd(`${p.year}-${pad(p.month)}-${pad(p.day)}`, newWeekday - oldWeekday);
  const startAt = clientScheduleInstantToUtcMysql(`${date} ${pad(newHour)}:${pad(p.minute)}:${pad(p.second || 0)}`, timeZone);
  if (!startAt) throw fail('An office session would fall in a nonexistent local time. Choose another time.');
  const endAt = dateToMysqlUtcDateTime(new Date(utc(startAt).getTime() + end.getTime() - start.getTime()));
  return { startAt, endAt, date };
}

/** Move the existing occurrences, appointments and session links; never recreate patient sessions. */
export async function moveOfficeSessionSeries({ assignment, assignments = [assignment], newRoomId, newWeekday, newHour, timeZone, actorUserId, bookingAgencyId = null, reason = '', approvalRequestId = null, reuseOwnReservations = false }) {
  const conn = await pool.getConnection();
  let moves = [];
  try {
    await conn.beginTransaction();
    if (approvalRequestId) await lockMoveApproval(conn, approvalRequestId);
    const held=await pendingOfficeWindows(conn,{officeId:assignment.office_location_id,timeZone});
    const today=utcToZonedMysqlWall(new Date(),timeZone).slice(0,10);
    const targetDate=addDaysYmd(today,(newWeekday-new Date(`${today}T12:00:00Z`).getUTCDay()+7)%7);
    if(held.some(p=>p.roomId===Number(newRoomId) && overlappingRequest({startDate:targetDate,startHour:newHour,endHour:newHour+assignments.length,recurrence:assignment.assigned_frequency || 'WEEKLY'},p))) throw fail('The target office is held by a pending request. Resolve that request first.');
    const assignmentIds = assignments.map(row => Number(row.id));
    const assignmentPlaceholders = assignmentIds.map(() => '?').join(',');
    // Serialize moves into the target room, including slots with no materialized events.
    await conn.execute('SELECT id FROM office_rooms WHERE id = ? FOR UPDATE', [newRoomId]);
    const [lockedAssignments] = await conn.execute(`SELECT id, room_id, weekday, hour FROM office_standing_assignments WHERE id IN (${assignmentPlaceholders}) FOR UPDATE`, assignmentIds);
    if (lockedAssignments.length !== assignmentIds.length || lockedAssignments.some(row => {
      const expected = assignments.find(a => Number(a.id) === Number(row.id));
      return Number(row.room_id) !== Number(expected.room_id) || Number(row.weekday) !== Number(expected.weekday) || Number(row.hour) !== Number(expected.hour);
    })) throw fail('This office block changed. Refresh before moving it.');
    const replacedAssignments = [];
    const reusedEvents = new Map();
    for (const source of assignments) {
      const targetHour = newHour + Number(source.hour) - Number(assignment.hour);
      if (targetHour < 0 || targetHour > 23) throw fail('The whole block must fit within one day');
      const [standingConflicts] = await conn.execute(`SELECT s.id, s.provider_id, s.hour, s.availability_mode, s.temporary_until_date, u.first_name, u.last_name FROM office_standing_assignments s JOIN users u ON u.id=s.provider_id WHERE s.office_location_id = ? AND s.room_id = ? AND s.weekday = ? AND s.hour = ? AND s.is_active = TRUE AND s.id NOT IN (${assignmentPlaceholders}) FOR UPDATE`, [assignment.office_location_id, newRoomId, newWeekday, targetHour, ...assignmentIds]);
      for (const conflict of standingConflicts) {
        if (reuseOwnReservations && Number(conflict.provider_id) === Number(assignment.provider_id)) {
          const [occupied] = await conn.execute(`SELECT e.id FROM office_events e WHERE e.standing_assignment_id=? AND e.start_at>=UTC_TIMESTAMP()
            AND (e.status IS NULL OR e.status<>'CANCELLED') AND (e.client_id IS NOT NULL OR e.clinical_session_id IS NOT NULL
              OR EXISTS(SELECT 1 FROM appointments a WHERE a.office_event_id=e.id)) LIMIT 1 FOR UPDATE`, [conflict.id]);
          const [clientPlans] = await conn.execute(`SELECT id FROM office_booking_plans WHERE standing_assignment_id=? AND is_active=TRUE
            AND (JSON_EXTRACT(session_context_json,'$.clientId') IS NOT NULL OR JSON_EXTRACT(session_context_json,'$.appointmentId') IS NOT NULL
              OR JSON_EXTRACT(session_context_json,'$.appointmentSeriesId') IS NOT NULL) LIMIT 1 FOR UPDATE`, [conflict.id]);
          if (occupied.length || clientPlans.length) throw fail('Your destination office series already has client sessions. Choose another room or move just this session.');
          replacedAssignments.push(conflict.id);
          continue;
        }
        const expiry = await retireExpiredOfficeAssignment(conn, conflict, timeZone);
        if (expiry.retired) continue;
        throw standingOfficeConflict(conflict, { weekday: newWeekday, startHour: newHour, endHour: newHour + assignments.length });
      }
    }
    let [events] = await conn.execute(
      `SELECT * FROM office_events WHERE standing_assignment_id IN (${assignmentPlaceholders}) AND start_at >= UTC_TIMESTAMP()
       AND (status IS NULL OR UPPER(status) NOT IN ('CANCELLED', 'CANCELED')) ORDER BY start_at FOR UPDATE`, assignmentIds
    );
    const legacyDuplicates = legacyOfficeAvailabilityDuplicates(events, assignments, timeZone);
    if (legacyDuplicates.length) {
      const ph = legacyDuplicates.map(() => '?').join(',');
      const [linked] = await conn.execute(`SELECT id FROM appointments WHERE office_event_id IN (${ph}) LIMIT 1 FOR UPDATE`, legacyDuplicates);
      const [clinical] = await clinicalPool.execute(`SELECT id FROM clinical_sessions WHERE office_event_id IN (${ph}) LIMIT 1`, legacyDuplicates);
      if (linked.length || clinical.length) throw fail('Duplicate legacy office times have linked sessions. Review those records before moving this block.');
      await conn.execute(`UPDATE office_events SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id IN (${ph})`, legacyDuplicates);
      events = events.filter(event => !legacyDuplicates.includes(Number(event.id)));
    }
    const ids = events.map((event) => Number(event.id));
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const [finished] = await conn.execute(`SELECT id FROM appointments WHERE office_event_id IN (${placeholders}) AND status NOT IN ('scheduled', 'confirmed') LIMIT 1`, ids);
      if (finished.length || events.some((event) => ['COMPLETED', 'NO_SHOW', 'CANCELLED', 'CANCELED'].includes(String(event.status_outcome || '').toUpperCase()))) throw fail('This series contains a completed or canceled future session. Preserve that session before moving the series.');
      const [notes] = await clinicalPool.execute(
        `SELECT n.id FROM clinical_notes n JOIN clinical_sessions s ON s.id = n.clinical_session_id
         WHERE s.office_event_id IN (${placeholders}) AND n.is_deleted = 0 AND n.provider_signed_at IS NOT NULL LIMIT 1`, ids
      );
      if (notes.length) throw fail('A future session has a signed note. Resolve that session before moving this series.');
      moves = events.map((event) => {
        const source = assignments.find(row => Number(row.id) === Number(event.standing_assignment_id));
        return { event, ...movedOfficeWindow(event, { oldWeekday: Number(source.weekday), newWeekday, newHour: newHour + Number(source.hour) - Number(assignment.hour), timeZone }) };
      });
      const targetWindows = moves.map(move => `${move.startAt}/${move.endAt}`);
      if (new Set(targetWindows).size !== targetWindows.length) throw fail('This series contains duplicate session times. Review the duplicate records before moving the block.');
      for (const move of moves) {
        if (utc(move.startAt).getTime() <= Date.now()) throw fail('This move would place an upcoming session in the past');
        const [conflicts] = await conn.execute(
          `SELECT e.id, e.start_at, e.end_at, e.status, e.client_id, e.clinical_session_id, e.billing_context_id, e.assigned_provider_id, e.booked_provider_id,
            EXISTS(SELECT 1 FROM appointments a WHERE a.office_event_id=e.id) AS has_appointment,
            COALESCE(e.booked_provider_id, e.assigned_provider_id) AS provider_id, u.first_name, u.last_name FROM office_events e LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id) WHERE e.room_id = ? AND e.start_at < ? AND e.end_at > ?
           AND (e.status IS NULL OR UPPER(e.status) NOT IN ('CANCELLED', 'CANCELED')) AND e.id NOT IN (${placeholders}) FOR UPDATE`,
          [newRoomId, move.endAt, move.startAt, ...ids]
        );
        const [providerConflicts] = await conn.execute(
          `SELECT id FROM appointments WHERE provider_user_id = ? AND start_at < ? AND end_at > ?
           AND status IN ('scheduled', 'confirmed') AND (office_event_id IS NULL OR office_event_id NOT IN (${placeholders})) LIMIT 1 FOR UPDATE`,
          [assignment.provider_id, move.endAt, move.startAt, ...ids]
        );
        if (providerConflicts.length) throw fail('The provider has another session at the target time. No sessions were moved.');
        const [calendarConflicts] = await conn.execute(`SELECT p.id FROM provider_schedule_events p LEFT JOIN appointments a ON a.provider_schedule_event_id = p.id
          WHERE p.provider_id = ? AND p.start_at < ? AND p.end_at > ? AND UPPER(COALESCE(p.status, 'ACTIVE')) <> 'CANCELLED'
          AND (a.office_event_id IS NULL OR a.office_event_id NOT IN (${placeholders})) LIMIT 1`, [assignment.provider_id, move.endAt, move.startAt, ...ids]);
        if (calendarConflicts.length) throw fail('The provider has a calendar event at the target time. No sessions were moved.');
        const occupied = conflicts.filter(event => !reuseOwnReservations || !isOwnEmptyReservation(event, assignment.provider_id));
        if (occupied.length) throw eventOfficeConflict(occupied[0], { startAt: move.startAt, endAt: move.endAt, timeZone });
        for (const event of conflicts) reusedEvents.set(event.id, event);
      }
      for (const event of reusedEvents.values()) await conn.execute("UPDATE office_events SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?", [event.id]);
      const forward = newWeekday > Number(assignment.weekday) || (newWeekday === Number(assignment.weekday) && newHour > Number(assignment.hour));
      for (const move of [...moves].sort((a, b) => (forward ? -1 : 1) * (utc(a.event.start_at) - utc(b.event.start_at)))) {
        await conn.execute(`UPDATE office_events SET room_id = ?, start_at = ?, end_at = ?, google_sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newRoomId, move.startAt, move.endAt, move.event.id]);
        await conn.execute(
          `UPDATE provider_schedule_events p JOIN appointments a ON a.provider_schedule_event_id = p.id
           SET p.start_at = ?, p.end_at = ?, p.updated_at = CURRENT_TIMESTAMP WHERE a.office_event_id = ?`,
          [move.startAt, move.endAt, move.event.id]
        );
        await conn.execute('UPDATE appointments SET room_id = ?, start_at = ?, end_at = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE office_event_id = ?',
          [newRoomId, move.startAt, move.endAt, actorUserId, move.event.id]);
      }
    }
    if (replacedAssignments.length) {
      const ph = replacedAssignments.map(() => '?').join(',');
      // Only empty reservations owned by this provider are merged into the
      // source series. Existing clinical appointment identities stay intact.
      await conn.execute(`UPDATE office_events SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE standing_assignment_id IN (${ph}) AND start_at>=UTC_TIMESTAMP()`, replacedAssignments);
      for (const table of ['provider_virtual_slot_availability', 'provider_in_person_slot_availability']) {
        await conn.execute(`UPDATE ${table} v JOIN office_events e ON e.id=v.source_event_id SET v.is_active=FALSE
          WHERE e.standing_assignment_id IN (${ph}) AND e.start_at>=UTC_TIMESTAMP()`, replacedAssignments);
      }
      await conn.execute(`UPDATE office_booking_plans SET is_active=FALSE WHERE standing_assignment_id IN (${ph})`, replacedAssignments);
      await conn.execute(`UPDATE office_standing_assignments SET is_active=FALSE WHERE id IN (${ph})`, replacedAssignments);
    }
    if (bookingAgencyId) {
      // Clinical sessions keep their original tenant. A room-only reservation may be retagged.
      const [clinicalTenants] = await conn.execute(`SELECT id FROM appointments WHERE office_event_id IN (SELECT id FROM office_events WHERE standing_assignment_id IN (${assignmentPlaceholders})) AND agency_id <> ? LIMIT 1`, [...assignmentIds, bookingAgencyId]);
      if (clinicalTenants.length) throw fail('This series has client sessions under another agency. Change the clinical booking through its agency before moving it.');
      await conn.execute(`UPDATE office_standing_assignments SET booking_agency_id = ? WHERE id IN (${assignmentPlaceholders})`, [bookingAgencyId, ...assignmentIds]);
      await conn.execute(`UPDATE office_booking_plans SET session_context_json = JSON_SET(COALESCE(session_context_json, JSON_OBJECT()), '$.agencyId', ?) WHERE standing_assignment_id IN (${assignmentPlaceholders}) AND is_active = TRUE`, [bookingAgencyId, ...assignmentIds]);
      await conn.execute(`UPDATE office_events SET session_context_json = JSON_SET(COALESCE(session_context_json, JSON_OBJECT()), '$.agencyId', ?) WHERE standing_assignment_id IN (${assignmentPlaceholders}) AND start_at >= UTC_TIMESTAMP() AND client_id IS NULL AND clinical_session_id IS NULL`, [bookingAgencyId, ...assignmentIds]);
    }
    if (moves.length) {
      const ids = [...moves.map(move => move.event.id), ...reusedEvents.keys()], ph = ids.map(() => '?').join(',');
      for (const table of ['provider_virtual_slot_availability', 'provider_in_person_slot_availability']) {
        await conn.execute(`UPDATE ${table} SET is_active = FALSE WHERE source_event_id IN (${ph})`, ids);
      }
    }
    for (const move of moves) {
      const source = assignments.find(row => Number(row.id) === Number(move.event.standing_assignment_id));
      await publishOfficeAssignmentEvent({ ...source, room_id: newRoomId, booking_agency_id: bookingAgencyId || source.booking_agency_id },
        { ...move.event, room_id: newRoomId, start_at: move.startAt, end_at: move.endAt }, conn, actorUserId);
    }
    const deltaDays = newWeekday - Number(assignment.weekday);
    const [plans] = await conn.execute(`SELECT id, skipped_dates_json FROM office_booking_plans WHERE standing_assignment_id IN (${assignmentPlaceholders}) AND is_active = TRUE FOR UPDATE`, assignmentIds);
    for (const plan of plans) {
      const skipped = typeof plan.skipped_dates_json === 'string' ? JSON.parse(plan.skipped_dates_json) : (plan.skipped_dates_json || []);
      await conn.execute('UPDATE office_booking_plans SET booking_start_date = DATE_ADD(booking_start_date, INTERVAL ? DAY), active_until_date = DATE_ADD(active_until_date, INTERVAL ? DAY), skipped_dates_json = ? WHERE id = ?',
        [deltaDays, deltaDays, JSON.stringify(skipped.map((date) => addDaysYmd(date, deltaDays))), plan.id]);
    }
    for (const source of [...assignments].sort((a, b) => (newHour > Number(assignment.hour) ? -1 : 1) * (Number(a.hour) - Number(b.hour)))) await conn.execute('UPDATE office_standing_assignments SET room_id = ?, weekday = ?, hour = ?, available_since_date = DATE_ADD(available_since_date, INTERVAL ? DAY), temporary_until_date = DATE_ADD(temporary_until_date, INTERVAL ? DAY), last_two_week_confirmed_at = NOW() WHERE id = ?',
      [newRoomId, newWeekday, newHour + Number(source.hour) - Number(assignment.hour), deltaDays, deltaDays, source.id]);
    if (approvalRequestId) await conn.execute("UPDATE office_booking_requests SET status = 'APPROVED', decided_by_user_id = ?, decided_at = UTC_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP WHERE id = ?", [actorUserId, approvalRequestId]);
    const todayParts = utcDateToZonedParts(new Date(), timeZone);
    const localToday = `${todayParts.year}-${String(todayParts.month).padStart(2,'0')}-${String(todayParts.day).padStart(2,'0')}`;
    const firstDate = addDaysYmd(localToday, (newWeekday-new Date(`${localToday}T12:00:00Z`).getUTCDay()+7)%7 || 7);
    const firstMove = moves[0] || {startAt:mysqlDateTimeForDateHour(firstDate,newHour,timeZone),endAt:mysqlDateTimeForDateHour(firstDate,newHour+assignments.length,timeZone)};
    const blockEnd=dateToMysqlUtcDateTime(new Date(utc(firstMove.startAt).getTime()+assignments.length*3600000));
    await conn.execute(`UPDATE office_assignment_checkin_usage SET monitoring_started_at=UTC_TIMESTAMP(),unused_occurrences=0 WHERE assignment_id IN (${assignmentPlaceholders})`,assignmentIds);
    await queueOfficeMoveReceipt(conn, { source:{...assignment,block_hours:assignments.length},newRoomId,startAt:firstMove.startAt,endAt:blockEnd,scope:'future',timeZone,reason,actorUserId });
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }

  // The clinical plane is a separate database. Preserve IDs and make any synchronization failure explicit.
  await synchronizeMovedOfficeSessions(moves);
  return moves.map((move) => Number(move.event.id));
}

async function lockMoveApproval(conn, requestId) {
  const [[request]] = await conn.execute('SELECT * FROM office_booking_requests WHERE id = ? FOR UPDATE', [requestId]);
  if (!request || request.status !== 'PENDING') throw fail('This change request is no longer pending.');
  const meta = typeof request.requester_notes === 'string' ? JSON.parse(request.requester_notes) : request.requester_notes;
  for (const expected of meta.sources || []) {
    const table = request.request_type === 'MOVE_ASSIGNMENT' ? 'office_standing_assignments' : 'office_events';
    const [[current]] = await conn.execute(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [expected.id]);
    if (!current || Object.entries(expected).some(([key, value]) => (current[key] instanceof Date ? current[key].toISOString() : String(current[key] ?? '')) !== (value instanceof Date ? value.toISOString() : String(value ?? '')))) {
      throw fail('The original reservation changed after this request. It has been kept; ask the provider to submit a fresh request.');
    }
  }
}
