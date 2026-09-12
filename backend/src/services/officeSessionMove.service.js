import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { utcDateToZonedParts, wallMysqlToUtcMysql, dateToMysqlUtcDateTime } from '../utils/zonedWallTime.util.js';

const fail = (message) => Object.assign(new Error(message), { status: 409 });
const utc = (value) => value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T').replace(/Z$/, '')}Z`);

export async function moveOfficeSessionOccurrence({ eventId, newRoomId, startAt, endAt, timeZone, actorUserId }) {
  if (!(utc(startAt).getTime() > Date.now()) || !(utc(endAt) > utc(startAt))) throw fail('Choose a valid future session time');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[event]] = await conn.execute('SELECT * FROM office_events WHERE id = ? FOR UPDATE', [eventId]);
    if (!event || event.status !== 'BOOKED') throw fail('Only booked office sessions can be moved');
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
    await conn.execute(`UPDATE provider_schedule_events p JOIN appointments a ON a.provider_schedule_event_id = p.id
      SET p.start_at = ?, p.end_at = ?, p.updated_at = CURRENT_TIMESTAMP WHERE a.office_event_id = ?`, [startAt, endAt, eventId]);
    await conn.execute(`UPDATE appointments SET room_id = ?, start_at = ?, end_at = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE office_event_id = ?`, [newRoomId, startAt, endAt, actorUserId, eventId]);
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
export async function moveOfficeSessionSeries({ assignment, newRoomId, newWeekday, newHour, timeZone, actorUserId }) {
  const conn = await pool.getConnection();
  let moves = [];
  try {
    await conn.beginTransaction();
    await conn.execute('SELECT id FROM office_standing_assignments WHERE id = ? FOR UPDATE', [assignment.id]);
    const [events] = await conn.execute(
      `SELECT * FROM office_events WHERE standing_assignment_id = ? AND start_at >= UTC_TIMESTAMP()
       AND status <> 'CANCELLED' ORDER BY start_at FOR UPDATE`, [assignment.id]
    );
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
      moves = events.map((event) => ({ event, ...movedOfficeWindow(event, { oldWeekday: Number(assignment.weekday), newWeekday, newHour, timeZone }) }));
      for (const move of moves) {
        if (utc(move.startAt).getTime() <= Date.now()) throw fail('This move would place an upcoming session in the past');
        const [conflicts] = await conn.execute(
          `SELECT id FROM office_events WHERE room_id = ? AND start_at < ? AND end_at > ?
           AND status <> 'CANCELLED' AND id NOT IN (${placeholders}) LIMIT 1 FOR UPDATE`,
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
        if (conflicts.length) throw fail('The target office has a conflicting event. No sessions were moved.');
      }
      for (const move of moves) {
        await conn.execute('UPDATE office_events SET room_id = ?, start_at = ?, end_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
    const deltaDays = newWeekday - Number(assignment.weekday);
    const [plans] = await conn.execute('SELECT id, skipped_dates_json FROM office_booking_plans WHERE standing_assignment_id = ? AND is_active = TRUE FOR UPDATE', [assignment.id]);
    for (const plan of plans) {
      const skipped = typeof plan.skipped_dates_json === 'string' ? JSON.parse(plan.skipped_dates_json) : (plan.skipped_dates_json || []);
      await conn.execute('UPDATE office_booking_plans SET booking_start_date = DATE_ADD(booking_start_date, INTERVAL ? DAY), active_until_date = DATE_ADD(active_until_date, INTERVAL ? DAY), skipped_dates_json = ? WHERE id = ?',
        [deltaDays, deltaDays, JSON.stringify(skipped.map((date) => addDaysYmd(date, deltaDays))), plan.id]);
    }
    await conn.execute('UPDATE office_standing_assignments SET room_id = ?, weekday = ?, hour = ?, available_since_date = DATE_ADD(available_since_date, INTERVAL ? DAY), temporary_until_date = DATE_ADD(temporary_until_date, INTERVAL ? DAY), last_two_week_confirmed_at = NOW() WHERE id = ?',
      [newRoomId, newWeekday, newHour, deltaDays, deltaDays, assignment.id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }

  // The clinical plane is a separate database. Preserve IDs and make any synchronization failure explicit.
  await synchronizeMovedOfficeSessions(moves);
  return moves.map((move) => Number(move.event.id));
}
