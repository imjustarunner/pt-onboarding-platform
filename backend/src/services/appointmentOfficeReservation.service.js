import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import { ownReservationsCover } from '../utils/officeMoveReservation.js';
import { withClientSchedulingLock } from './clientSchedulingGuard.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { readAppointmentRecord } from './appointmentRecord.service.js';
import staffTools from './appointmentStaffTools.service.js';
import { utcMysqlToIso, utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { updateAppointment } from './appointment.service.js';

const fail = message => Object.assign(new Error(message), { status: 409 });
export function createAppointmentOfficeReservations({ db = pool, access = staffTools.authorizeEdit, appointments = Appointment, update = updateAppointment,
  readRecord = readAppointmentRecord, serviceLocations = AgencyServiceLocation, materialize = async input => (await import('./officeScheduleMaterializer.service.js')).default.materializeWeek(input)
} = {}) {
  async function reservations(appointment) {
    const [rows] = await db.execute(`SELECT e.id,e.room_id,e.office_location_id,r.room_number,r.label,ol.name AS office_name,ol.timezone AS office_timezone
      FROM office_events e JOIN office_rooms r ON r.id=e.room_id JOIN office_locations ol ON ol.id=e.office_location_id
      JOIN office_location_agencies ola ON ola.office_location_id=e.office_location_id AND ola.agency_id=?
      WHERE e.booked_provider_id=? AND e.status='BOOKED' AND e.start_at<=? AND e.end_at>=?
      AND e.client_id IS NULL AND e.clinical_session_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM appointments occupied WHERE occupied.room_id=e.room_id AND occupied.id<>?
        AND occupied.start_at<? AND occupied.end_at>? AND occupied.status IN ('scheduled','confirmed','client_confirmed'))
      ORDER BY e.office_location_id,e.room_id,e.id`,
    [appointment.agencyId, appointment.providerUserId, appointment.startAt, appointment.endAt, appointment.id, appointment.endAt, appointment.startAt]);
    return rows.map(row => ({ id: Number(row.id), roomId: Number(row.room_id), officeLocationId: Number(row.office_location_id),
      timeZone: row.office_timezone || 'America/Denver', label: `${row.office_name} · ${row.label || `Office #${row.room_number || row.room_id}`}` }));
  }
  async function series(appointment) {
    if (!appointment.providerScheduleEventId) return null;
    const [[event]] = await db.execute('SELECT recurrence_series_id FROM provider_schedule_events WHERE id=? AND agency_id=?', [appointment.providerScheduleEventId, appointment.agencyId]);
    return event?.recurrence_series_id || null;
  }
  async function get(user, id) {
    const appointment = await access(user, id, true, true);
    if (!['scheduled','confirmed','client_confirmed'].includes(appointment.status)) return { options: [], seriesAvailable: false };
    return { options: await reservations(appointment), seriesAvailable: !!await series(appointment), linkedRoomId: appointment.roomId || null };
  }
  async function link(user, id, input) {
    const appointment = await access(user, id, true, true);
    if (!['scheduled','confirmed','client_confirmed'].includes(appointment.status)) throw fail('Only upcoming sessions can be linked to an office reservation.');
    if (!['occurrence','series'].includes(input.scope || 'occurrence')) throw fail('Choose this appointment or this and future appointments in the series.');
    const selected = (await reservations(appointment)).find(row => row.id === Number(input.officeEventId));
    if (!selected) throw fail('That reserved office is no longer available for this session. Refresh office reservations.');
    const targetIds = [Number(id)];
    if (input.scope === 'series') {
      const seriesId = await series(appointment);
      if (!seriesId) throw fail('This session is not part of a saved recurring series.');
      const [rows] = await db.execute(`SELECT a.id FROM appointments a JOIN provider_schedule_events e ON e.id=a.provider_schedule_event_id
        WHERE e.recurrence_series_id=? AND a.agency_id=? AND a.provider_user_id=? AND a.start_at>=?
        AND a.status IN ('scheduled','confirmed','client_confirmed') ORDER BY a.start_at,a.id LIMIT 501`,
      [seriesId, appointment.agencyId, appointment.providerUserId, appointment.startAt]);
      if (rows.length > 500) throw fail('Link a smaller series of up to 500 saved occurrences.');
      targetIds.splice(0, targetIds.length, ...rows.map(row => Number(row.id)));
    }
    const clientIds = async apptId => (await appointments.listParticipants(apptId)).map(p => Number(p.clientId)).filter(Boolean).sort((a,b)=>a-b).join(',');
    const expectedClients = await clientIds(id);
    const targets = [];
    for (const targetId of targetIds) {
      const target = await access(user, targetId, true, true);
      if (await clientIds(targetId) !== expectedClients) throw fail('The series includes different clients. Link those appointments individually.');
      if (target.officeEventId) throw fail('This session already has an office session record. Edit its room through the existing office booking.');
      let room = (await reservations(target)).find(row => row.roomId === selected.roomId && row.officeLocationId === selected.officeLocationId);
      if (!room) {
        // Standing office bookings are generated lazily. Generate only this
        // reserved hour before rejecting a later date in an existing series.
        const start=new Date(utcMysqlToIso(target.startAt));start.setUTCMinutes(0,0,0);
        const date=utcDateToZonedYmd(start,selected.timeZone);
        await materialize({officeLocationId:selected.officeLocationId,weekStartRaw:date,createdByUserId:user.id,force:true,
          reservationWindow:{roomId:selected.roomId,date,startAt:start.toISOString().slice(0,19).replace('T',' '),endAt:new Date(+start+3600000).toISOString().slice(0,19).replace('T',' ')}});
        room=(await reservations(target)).find(row => row.roomId === selected.roomId && row.officeLocationId === selected.officeLocationId);
      }
      if (!room) throw fail('The selected office is not reserved for every saved occurrence. Reserve the missing dates or choose this appointment only.');
      targets.push({ targetId, room });
    }
    const linkedAppointmentIds = [];
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      // Hold the reservation rows while attaching rooms so a simultaneous release
      // or reassignment cannot invalidate the ownership check before the save.
      for (const { targetId, room } of targets) {
        const target = await access(user, targetId, true, true);
        const [[reserved]] = await conn.execute(`SELECT id FROM office_events WHERE id=? AND booked_provider_id=?
          AND status='BOOKED' AND room_id=? AND office_location_id=? AND start_at<=? AND end_at>=? FOR UPDATE`,
        [room.id, target.providerUserId, room.roomId, room.officeLocationId, target.startAt, target.endAt]);
        if (!reserved) throw fail('An office reservation changed while linking. Refresh the reservations and retry.');
      }
      for (const { targetId, room } of targets) {
        // Preserve the appointment's clinical session, notes, participants, time and recurrence.
        // office_event_id belongs to office-origin clinical sessions; assigning it here
        // would manufacture a second clinical session on the next context refresh.
        await update(targetId, { officeLocationId: room.officeLocationId, roomId: room.roomId }, { actorUserId: user.id });
        linkedAppointmentIds.push(targetId);
        await db.execute(`INSERT INTO appointment_communications
          (appointment_id,agency_id,direction,channel,kind,body_preview,metadata_json,created_by_user_id)
          VALUES (?,?,'system','in_app','office_reservation_link','Existing office reservation linked.',?,?)`,
        [targetId,appointment.agencyId,JSON.stringify({officeEventId:room.id,roomId:room.roomId,officeLocationId:room.officeLocationId}),user.id]);
      }
      await conn.commit();
    } catch (error) { await conn.rollback(); error.linkedAppointmentIds = linkedAppointmentIds; throw error; }
    finally { conn.release(); }
    return { linkedAppointmentIds, roomId: selected.roomId, officeLocationId: selected.officeLocationId };
  }
  async function moveToReservedRoom(user, appointment, plan, room) {
    const { id } = appointment;
    const participants = await appointments.listParticipants(id);
    return withClientSchedulingLock(participants.map(person => person.clientId || person.client_id),
      () => moveReservedOccurrence(user, appointment, plan, room));
  }

  async function moveReservedOccurrence(user, appointment, plan, room) {
    const { agencyId, id, providerUserId } = appointment;
    const connection = await db.getConnection();
    const lockName = OfficeEvent.lockNameForSlot({ roomId: room.id });
    let locked = false;
    try {
      const [[lock]] = await connection.execute('SELECT GET_LOCK(?,8) AS acquired', [lockName]);
      locked = Number(lock?.acquired) === 1;
      if (!locked) throw fail('This room is being updated. Retry the move shortly.');
      const record = await readRecord(agencyId, id, connection);
      const current = record.data;
      if (current.officeEventId || Number(current.providerUserId) !== Number(providerUserId)
        || +parseUtcDate(current.startAt) !== +parseUtcDate(appointment.startAt)
        || +parseUtcDate(current.endAt) !== +parseUtcDate(appointment.endAt)) {
        throw fail('This session changed. Refresh the schedule before moving it.');
      }

      const [events] = await connection.execute(`SELECT e.id,e.start_at,e.end_at,e.status,e.booked_provider_id,e.assigned_provider_id,e.billing_context_id
        FROM office_events e JOIN office_location_agencies member ON member.office_location_id=e.office_location_id AND member.agency_id=?
        WHERE e.office_location_id=? AND e.room_id=? AND COALESCE(e.booked_provider_id,e.assigned_provider_id)=?
          AND e.status='BOOKED' AND COALESCE(e.slot_state,'')<>'COMPANY_HOLD'
          AND e.client_id IS NULL AND e.clinical_session_id IS NULL AND e.start_at<? AND e.end_at>?
          AND NOT EXISTS (SELECT 1 FROM appointments occupied WHERE occupied.room_id=e.room_id AND occupied.id<>?
            AND occupied.start_at<? AND occupied.end_at>? AND occupied.status IN ('scheduled','confirmed','client_confirmed','in_progress'))
        ORDER BY e.start_at,e.id`, [agencyId, room.buildingId, room.id, providerUserId, plan.endAt, plan.startAt, id, plan.endAt, plan.startAt]);
      const start = parseUtcDate(plan.startAt), end = parseUtcDate(plan.endAt);
      if (!ownReservationsCover(events, providerUserId, start, end)) {
        throw fail('Your destination reservation changed or is occupied. Check the available rooms again.');
      }
      const officeLocations = (await serviceLocations.listByAgency(agencyId)).filter(location => String(location.place_of_service) === '11');
      const location = officeLocations.find(location => [location.physical_office_location_id, location.billing_office_location_id].map(Number).includes(Number(room.buildingId)))
        || officeLocations.find(location => !location.billing_office_location_id);
      // Keep the school-origin appointment's calendar and clinical identity. The
      // reserved building and room associate it with the office in the calendar.
      const updated = await update(id, {
        startAt: start.toISOString(), endAt: end.toISOString(), timeZone: plan.timeZone,
        roomId: room.id, officeLocationId: room.buildingId, serviceLocationId: location ? Number(location.id) : null
      }, { actorUserId: user.id, expectedScheduleFingerprint: record.fingerprint, detachCalendarOccurrence: plan.hasSeries });
      return { ok: true, appointment: updated };
    } finally {
      try { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
      finally { connection.release(); }
    }
  }

  return { get, link, moveToReservedRoom };
}
export default createAppointmentOfficeReservations();
