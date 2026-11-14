import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import staffTools from './appointmentStaffTools.service.js';
import { utcMysqlToIso, utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { updateAppointment } from './appointment.service.js';

const fail = message => Object.assign(new Error(message), { status: 409 });
export function createAppointmentOfficeReservations({ db = pool, access = staffTools.authorizeEdit, appointments = Appointment, update = updateAppointment,
  materialize = async input => (await import('./officeScheduleMaterializer.service.js')).default.materializeWeek(input)
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
  return { get, link };
}
export default createAppointmentOfficeReservations();
