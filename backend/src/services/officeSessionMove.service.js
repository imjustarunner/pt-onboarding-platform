import { publishOfficeAssignmentEvent } from './officeAssignmentBookingAvailability.service.js';
import { legacyOfficeAvailabilityDuplicates } from '../utils/officeLegacyDuplicates.js';
import { retireExpiredOfficeAssignment } from './officeAssignmentExpiry.service.js';
import { standingOfficeConflict, eventOfficeConflict } from '../utils/officeMoveConflict.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { utcDateToZonedParts, wallMysqlToUtcMysql, dateToMysqlUtcDateTime } from '../utils/zonedWallTime.util.js';

const fail = (message) => Object.assign(new Error(message), { status: 409 });
const utc = (value) => value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T').replace(/Z$/, '')}Z`);

export async function moveOfficeSessionOccurrence({ eventId, newRoomId, startAt, endAt, timeZone, actorUserId, approvalRequestId = null }) {
  if (!(utc(startAt).getTime() > Date.now()) || !(utc(endAt) > utc(startAt))) throw fail('Choose a valid future session time');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (approvalRequestId) await lockMoveApproval(conn, approvalRequestId);
    const [[event]] = await conn.execute('SELECT * FROM office_events WHERE id = ? FOR UPDATE', [eventId]);
    if (!event || !['BOOKED', 'RELEASED'].includes(event.status)) throw fail('Only active office reservations can be moved');
    if (['COMPLETED', 'NO_SHOW', 'CANCELLED', 'CANCELED'].includes(String(event.status_outcome || '').toUpperCase())) throw fail('Completed and canceled sessions cannot be moved');
    const [appointments] = await conn.execute('SELECT id, status FROM appointments WHERE office_event_id = ? FOR UPDATE', [eventId]);
    if (appointments.some((a) => !['scheduled', 'confirmed'].includes(a.status))) throw fail('Completed and canceled sessions cannot be moved');
    const [notes] = await clinicalPool.execute(`SELECT n.id FROM clinical_notes n JOIN clinical_sessions s ON s.id = n.clinical_session_id
      WHERE s.office_event_id = ? AND n.is_deleted = 0 AND n.provider_signed_at IS NOT NULL LIMIT 1`, [eventId]);
    if (notes.length) throw fail('A signed note is attached to this session. Preserve that record and book a new session.');
    const providerId = Number(event.booked_provider_id || event.assigned_provider_id);
    const [roomConflicts] = await conn.execute(`SELECT * FROM office_events WHERE room_id = ? AND start_at < ? AND end_at > ?
      AND (status IS NULL OR status <> 'CANCELLED') AND id <> ? FOR UPDATE`, [newRoomId, endAt, startAt, eventId]);
    const ownAvailability = roomConflicts.filter((e) => e.status !== 'BOOKED' && !e.client_id && !e.clinical_session_id
      && Number(e.assigned_provider_id) === providerId);
    if (roomConflicts.length !== ownAvailability.length) throw fail('This office is occupied or assigned to another provider. Request an available office before moving the session.');
    const [providerConflicts] = await conn.execute(`SELECT id FROM appointments WHERE provider_user_id = ? AND start_at < ? AND end_at > ?
      AND status IN ('scheduled', 'confirmed') AND (office_event_id IS NULL OR office_event_id <> ?) LIMIT 1 FOR UPDATE`, [providerId, endAt, startAt, eventId]);
    if (providerConflicts.length) throw fail('The provider already has a session at that time');
    const [calendarConflicts] = await conn.execute(`SELECT p.id FROM provider_schedule_events p LEFT JOIN appointments a ON a.provider_schedule_event_id = p.id
      WHERE p.provider_id = ? AND p.start_at < ? AND p.end_at > ? AND p.status = 'ACTIVE'
      AND (a.office_event_id IS NULL OR a.office_event_id <> ?) LIMIT 1 FOR UPDATE`, [providerId, endAt, startAt, eventId]);
    if (calendarConflicts.length) throw fail('The provider has a calendar event at that time');
    for (const available of ownAvailability) await conn.execute("UPDATE office_events SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [available.id]);
    if (event.booking_plan_id) {
      const [[plan]] = await conn.execute('SELECT skipped_dates_json FROM office_booking_plans WHERE id = ? FOR UPDATE', [event.booking_plan_id]);
      const skips = typeof plan?.skipped_dates_json === 'string' ? JSON.parse(plan.skipped_dates_json) : (plan?.skipped_dates_json || []);
      const p = utcDateToZonedParts(utc(event.start_at), timeZone);
      const originalDate = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
      await conn.execute('UPDATE office_booking_plans SET skipped_dates_json = ? WHERE id = ?', [JSON.stringify([...new Set([...skips, originalDate])]), event.booking_plan_id]);
    }
    await conn.execute('UPDATE office_events SET room_id = ?, start_at = ?, end_at = ?, standing_assignment_id = NULL, assigned_provider_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newRoomId, startAt, endAt, providerId, eventId]);
    if (event.standing_assignment_id && (Number(newRoomId) !== Number(event.room_id) || utc(startAt).getTime() !== utc(event.start_at).getTime())) {
      await conn.execute(`INSERT INTO office_events (office_location_id, room_id, start_at, end_at, status, standing_assignment_id, assigned_provider_id, created_by_user_id)
        VALUES (?, ?, ?, ?, 'CANCELLED', ?, ?, ?)`, [event.office_location_id, event.room_id, event.start_at, event.end_at, event.standing_assignment_id, providerId, actorUserId]);
    }
    for (const table of ['provider_virtual_slot_availability', 'provider_in_person_slot_availability']) {
      await conn.execute(`UPDATE ${table} SET is_active = FALSE WHERE source_event_id = ?`, [eventId]);
    }
    await conn.execute(`UPDATE provider_schedule_events p JOIN appointments a ON a.provider_schedule_event_id = p.id
      SET p.start_at = ?, p.end_at = ?, p.updated_at = CURRENT_TIMESTAMP WHERE a.office_event_id = ?`, [startAt, endAt, eventId]);
    await conn.execute(`UPDATE appointments SET room_id = ?, start_at = ?, end_at = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE office_event_id = ?`, [newRoomId, startAt, endAt, actorUserId, eventId]);
    if (approvalRequestId) await conn.execute("UPDATE office_booking_requests SET status = 'APPROVED', decided_by_user_id = ?, decided_at = UTC_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP WHERE id = ?", [actorUserId, approvalRequestId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
  await synchronizeMovedOfficeSessions([{ event: { id: eventId }, startAt, endAt }]);
  return [Number(eventId)];
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
  const startAt = wallMysqlToUtcMysql(`${date} ${pad(newHour)}:${pad(p.minute)}:${pad(p.second || 0)}`, timeZone);
  const endAt = dateToMysqlUtcDateTime(new Date(utc(startAt).getTime() + end.getTime() - start.getTime()));
  return { startAt, endAt, date };
}

/** Move the existing occurrences, appointments and session links; never recreate patient sessions. */
export async function moveOfficeSessionSeries({ assignment, assignments = [assignment], newRoomId, newWeekday, newHour, timeZone, actorUserId, bookingAgencyId = null, approvalRequestId = null }) {
  const conn = await pool.getConnection();
  let moves = [];
  try {
    await conn.beginTransaction();
    if (approvalRequestId) await lockMoveApproval(conn, approvalRequestId);
    const assignmentIds = assignments.map(row => Number(row.id));
    const assignmentPlaceholders = assignmentIds.map(() => '?').join(',');
    // Serialize moves into the target room, including slots with no materialized events.
    await conn.execute('SELECT id FROM office_rooms WHERE id = ? FOR UPDATE', [newRoomId]);
    const [lockedAssignments] = await conn.execute(`SELECT id, room_id, weekday, hour FROM office_standing_assignments WHERE id IN (${assignmentPlaceholders}) FOR UPDATE`, assignmentIds);
    if (lockedAssignments.length !== assignmentIds.length || lockedAssignments.some(row => {
      const expected = assignments.find(a => Number(a.id) === Number(row.id));
      return Number(row.room_id) !== Number(expected.room_id) || Number(row.weekday) !== Number(expected.weekday) || Number(row.hour) !== Number(expected.hour);
    })) throw fail('This office block changed. Refresh before moving it.');
    for (const source of assignments) {
      const targetHour = newHour + Number(source.hour) - Number(assignment.hour);
      if (targetHour < 0 || targetHour > 23) throw fail('The whole block must fit within one day');
      const [standingConflicts] = await conn.execute(`SELECT s.id, s.provider_id, s.hour, s.availability_mode, s.temporary_until_date, u.first_name, u.last_name FROM office_standing_assignments s JOIN users u ON u.id=s.provider_id WHERE s.office_location_id = ? AND s.room_id = ? AND s.weekday = ? AND s.hour = ? AND s.is_active = TRUE AND s.id NOT IN (${assignmentPlaceholders}) FOR UPDATE`, [assignment.office_location_id, newRoomId, newWeekday, targetHour, ...assignmentIds]);
      for (const conflict of standingConflicts) {
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
          `SELECT e.id, e.start_at, e.end_at, COALESCE(e.booked_provider_id, e.assigned_provider_id) AS provider_id, u.first_name, u.last_name FROM office_events e LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id) WHERE e.room_id = ? AND e.start_at < ? AND e.end_at > ?
           AND (e.status IS NULL OR UPPER(e.status) NOT IN ('CANCELLED', 'CANCELED')) AND e.id NOT IN (${placeholders}) LIMIT 1 FOR UPDATE`,
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
        if (conflicts.length) throw eventOfficeConflict(conflicts[0], { startAt: move.startAt, endAt: move.endAt, timeZone });
      }
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
    if (bookingAgencyId) {
      // Clinical sessions keep their original tenant. A room-only reservation may be retagged.
      const [clinicalTenants] = await conn.execute(`SELECT id FROM appointments WHERE office_event_id IN (SELECT id FROM office_events WHERE standing_assignment_id IN (${assignmentPlaceholders})) AND agency_id <> ? LIMIT 1`, [...assignmentIds, bookingAgencyId]);
      if (clinicalTenants.length) throw fail('This series has client sessions under another agency. Change the clinical booking through its agency before moving it.');
      await conn.execute(`UPDATE office_standing_assignments SET booking_agency_id = ? WHERE id IN (${assignmentPlaceholders})`, [bookingAgencyId, ...assignmentIds]);
      await conn.execute(`UPDATE office_booking_plans SET session_context_json = JSON_SET(COALESCE(session_context_json, JSON_OBJECT()), '$.agencyId', ?) WHERE standing_assignment_id IN (${assignmentPlaceholders}) AND is_active = TRUE`, [bookingAgencyId, ...assignmentIds]);
      await conn.execute(`UPDATE office_events SET session_context_json = JSON_SET(COALESCE(session_context_json, JSON_OBJECT()), '$.agencyId', ?) WHERE standing_assignment_id IN (${assignmentPlaceholders}) AND start_at >= UTC_TIMESTAMP() AND client_id IS NULL AND clinical_session_id IS NULL`, [bookingAgencyId, ...assignmentIds]);
    }
    if (moves.length) {
      const ids = moves.map(move => move.event.id), ph = ids.map(() => '?').join(',');
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
