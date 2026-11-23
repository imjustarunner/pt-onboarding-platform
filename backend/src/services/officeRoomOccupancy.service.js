import OfficeEvent from '../models/OfficeEvent.model.js';
import pool from '../config/database.js';
import { mysqlDateTimeForDateHour, toMysqlUtcDateTime, utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';
import { officeOccupancy, roomAppointmentStatuses } from '../utils/officeRoomOccupancy.js';
import { officeSessionGapSql } from '../utils/officeSessionGap.js';
import { isAssignmentActiveOnDate } from './officeScheduleMaterializer.service.js';

const conflict = message => Object.assign(new Error(message), { status: 409 });

export async function setRoomOccupancy({ officeLocationId, eventId, assignmentId, date, usage, actorUserId, canManage }) {
  if (!['occupied', 'vacant'].includes(usage)) throw conflict('Choose occupied or vacant for the selected room time.');
  const [[office]] = await pool.execute('SELECT timezone FROM office_locations WHERE id=? AND is_active=1', [officeLocationId]);
  if (!office) throw conflict('This building is unavailable.');
  const timezone = office.timezone || 'America/Denver';
  const event = eventId ? await OfficeEvent.findById(eventId) : null;
  if (eventId && (!event || Number(event.office_location_id) !== officeLocationId)) throw conflict('This office reservation changed. Refresh the schedule.');
  const id = Number(event?.standing_assignment_id || assignmentId || 0);
  const [[assignment]] = id ? await pool.execute('SELECT * FROM office_standing_assignments WHERE id=? AND office_location_id=? AND is_active=1', [id, officeLocationId]) : [[]];
  const roomId = Number(event?.room_id || assignment?.room_id);
  const parsedDate = new Date(typeof date === 'string' ? date : '');
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(+parsedDate) && parsedDate.toISOString().slice(0,10) === date;
  if (!roomId || (!event && (!validDate || !assignment || !isAssignmentActiveOnDate(assignment, date)))) throw conflict('Choose an active reservation on this date.');
  const startAt = event ? toMysqlUtcDateTime(event.start_at) : mysqlDateTimeForDateHour(date, assignment.hour, timezone);
  const endAt = event ? toMysqlUtcDateTime(event.end_at) : mysqlDateTimeForDateHour(date, Number(assignment.hour) + 1, timezone);
  const now = new Date();
  if (utcToZonedMysqlWall(endAt, timezone) <= utcToZonedMysqlWall(now, timezone)) throw conflict('This reservation has already ended.');
  return OfficeEvent.withRoomSlotLock({ roomId, startAt, endAt }, async conn => {
    const [overlaps] = await conn.execute(`SELECT e.*, ${officeSessionGapSql()} AS office_gap_blocked
      FROM office_events e WHERE e.room_id=? AND e.start_at<? AND e.end_at>?
      AND COALESCE(e.status,'')<>'CANCELLED' FOR UPDATE`, [roomId, endAt, startAt]);
    const current = overlaps.find(row => Number(row.id) === Number(eventId)
      || (!eventId && Number(row.standing_assignment_id) === id));
    const owner = Number(current?.assigned_provider_id || assignment?.provider_id || event?.booked_provider_id);
    if (!owner || (!canManage && owner !== Number(actorUserId))) {
      throw Object.assign(new Error('Only the assigned provider or a schedule manager can change this room time.'), { status: 403 });
    }
    if ((event && !current) || (assignment && Number(current?.assigned_provider_id || owner) !== Number(assignment.provider_id))
      || overlaps.some(row => row !== current)
      || (current?.booked_provider_id && Number(current.booked_provider_id) !== owner)
      || ['borrowed', 'staff'].includes(officeOccupancy(current))
      || current?.slot_state === 'COMPANY_HOLD') throw conflict('This office reservation changed. Refresh the schedule.');
    if (current?.client_id || current?.clinical_session_id || current?.billing_context_id || current?.note_context_id
      || (usage === 'vacant' && Number(current?.office_gap_blocked))) {
      throw conflict('This room time is protected by a client session. Review the appointments first.');
    }
    const [appointments] = await conn.execute(`SELECT id FROM appointments
      WHERE status IN (${roomAppointmentStatuses}) AND (office_event_id=? OR (room_id=? AND start_at<? AND end_at>?))
      LIMIT 1 FOR UPDATE`, [current?.id || null, roomId, endAt, startAt]);
    if (appointments.length) throw conflict('A client appointment uses this time. Review the appointment first.');
    if (current) {
      await conn.execute(`UPDATE office_events SET status='RELEASED', slot_state='ASSIGNED_AVAILABLE',
        assigned_provider_id=?, booked_provider_id=NULL,
        session_context_json=JSON_SET(COALESCE(session_context_json, JSON_OBJECT()), '$.roomOccupancy', ?,
          '$.roomOccupancyChangedBy', ?, '$.roomOccupancyChangedAt', UTC_TIMESTAMP())
        WHERE id=?`, [owner, usage, actorUserId, current.id]);
    } else {
      await conn.execute(`INSERT INTO office_events
        (office_location_id,room_id,start_at,end_at,status,slot_state,standing_assignment_id,assigned_provider_id,
          session_context_json,created_by_user_id)
        VALUES (?,?,?,?,'RELEASED','ASSIGNED_AVAILABLE',?,?,JSON_OBJECT('roomOccupancy',?,
          'roomOccupancyChangedBy',?,'roomOccupancyChangedAt',UTC_TIMESTAMP()),?)`,
        [officeLocationId, roomId, startAt, endAt, id, owner, usage, actorUserId, actorUserId]);
    }
    return { ok: true, usage };
  });
}
