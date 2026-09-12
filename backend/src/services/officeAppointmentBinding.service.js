import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import Appointment from '../models/Appointment.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';

const instant = (value) => value instanceof Date ? value.getTime() : Date.parse(String(value).replace(' ', 'T').replace(/Z?$/, 'Z'));
const fail = (message) => Object.assign(new Error(message), { status: 409 });

/** A room request decorates the existing appointment; it must not create a second session/debit. */
export async function bindOfficeEventToAppointment({ event, context, agencyId, clientId }) {
  if (!context.appointmentId && !context.appointmentSeriesId) return null;
  let id = Number(context.appointmentId || 0);
  if (context.appointmentSeriesId) {
    const [matches] = await pool.execute(`SELECT a.id FROM appointments a JOIN provider_schedule_events p ON p.id = a.provider_schedule_event_id
      WHERE p.recurrence_series_id = ? AND a.agency_id = ? AND a.provider_user_id = ? AND a.start_at = ? AND a.end_at = ?`,
      [context.appointmentSeriesId, agencyId, event.booked_provider_id || event.assigned_provider_id, event.start_at, event.end_at]);
    if (matches.length !== 1) throw fail('The room occurrence does not match exactly one session in the requested series');
    id = Number(matches[0].id);
  }
  const lockConnection = await pool.getConnection();
  const lockName = `appointment_office_binding:${id}`;
  let locked = false;
  try {
    const [[lock]] = await lockConnection.execute('SELECT GET_LOCK(?, 8) AS acquired', [lockName]);
    locked = Number(lock?.acquired) === 1;
    if (!locked) throw fail('This appointment is being assigned an office; retry the same request');
    const appointment = await Appointment.findById(id);
    const participants = appointment ? await Appointment.listParticipants(id) : [];
    if (!appointment || Number(appointment.agencyId) !== Number(agencyId)
        || Number(appointment.providerUserId) !== Number(event.booked_provider_id || event.assigned_provider_id)
        || !participants.some((p) => Number(p.clientId) === Number(clientId))
        || Number(appointment.packageEntitlementId || 0) !== Number(context.packageEntitlementId || 0)) throw fail('The office request does not match this appointment, provider, client, or package');
    if (instant(appointment.startAt) !== instant(event.start_at) || instant(appointment.endAt) !== instant(event.end_at)) throw fail('The room and session must have the same start and end time');
    if (appointment.officeEventId && Number(appointment.officeEventId) !== Number(event.id)) throw fail('This session already has an office reservation');
    if (!appointment.officeEventId) {
      if (!['scheduled', 'confirmed'].includes(appointment.status)) throw fail('Only upcoming appointments can acquire an office reservation');
      const [signed] = await clinicalPool.execute(`SELECT n.id FROM clinical_notes n JOIN clinical_sessions s ON s.id = n.clinical_session_id
        WHERE s.appointment_id = ? AND n.is_deleted = 0 AND n.provider_signed_at IS NOT NULL LIMIT 1`, [id]);
      if (signed.length) throw fail('This session already has a signed note; its office context cannot change');
    }
    // Attach all group members' existing encounters without replacing their notes or IDs.
    await clinicalPool.execute('UPDATE clinical_sessions SET office_event_id = ? WHERE appointment_id = ? AND agency_id = ?', [event.id, id, agencyId]);
    await Appointment.update(id, { officeEventId: event.id, officeLocationId: event.office_location_id, roomId: event.room_id });
    return { ...appointment, officeEventId: event.id };
  } finally {
    try { if (locked) await lockConnection.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
    finally { lockConnection.release(); }
  }
}

export async function bookOfficeForAppointmentRequest({ request, context, rooms, office, selection, actorUserId }) {
  let appointments;
  if (context.appointmentSeriesId) {
    const [rows] = await pool.execute(`SELECT a.id FROM appointments a JOIN provider_schedule_events p ON p.id = a.provider_schedule_event_id
      WHERE p.recurrence_series_id = ? AND a.agency_id = ? AND a.provider_user_id = ? ORDER BY a.start_at`,
      [context.appointmentSeriesId, context.agencyId, request.requested_provider_id]);
    appointments = await Promise.all(rows.map((a) => Appointment.findById(a.id)));
  } else appointments = [await Appointment.findById(context.appointmentId)].filter(Boolean);
  if (!appointments.length) throw fail('No appointments match this office request');
  for (const a of appointments) {
    const participants = await Appointment.listParticipants(a.id);
    if (Number(a.agencyId) !== Number(context.agencyId) || Number(a.providerUserId) !== Number(request.requested_provider_id)
        || !participants.some((p) => Number(p.clientId) === Number(request.client_id)) || !['scheduled', 'confirmed'].includes(a.status)) throw fail('The requested sessions must belong to this provider, client, and agency');
    await OfficeScheduleMaterializer.materializeWeek({ officeLocationId: office.id, weekStartRaw: a.startAt instanceof Date ? a.startAt.toISOString().slice(0, 10) : String(a.startAt).slice(0, 10), createdByUserId: actorUserId, force: true });
  }
  let chosen;
  let recoverable = new Map();
  for (const room of rooms) {
    let available = true;
    const roomRecoverable = new Map();
    for (const a of appointments) {
      const conflicts = await OfficeEvent.findActiveRoomConflicts({ roomId: room.id, startAt: a.startAt, endAt: a.endAt, excludeEventId: a.officeEventId });
      if (a.officeEventId) {
        const old = await OfficeEvent.findById(a.officeEventId);
        if (Number(old?.room_id) !== Number(room.id)) { available = false; break; }
      }
      const unrelated = conflicts.filter((e) => {
        let saved = e.session_context_json || {};
        if (typeof saved === 'string') { try { saved = JSON.parse(saved); } catch { saved = {}; } }
        if (Number(saved.appointmentId) === Number(a.id) && Number(saved.officeRequestId) === Number(request.id)
            && Number(e.client_id) === Number(request.client_id) && Number(e.booked_provider_id) === Number(request.requested_provider_id)) {
          roomRecoverable.set(a.id, e.id);
          return false;
        }
        return true;
      });
      if (unrelated.some((e) => e.status === 'BOOKED' || Number(e.assigned_provider_id) !== Number(request.requested_provider_id))) { available = false; break; }
    }
    if (available) { chosen = room; recoverable = roomRecoverable; break; }
  }
  if (!chosen) throw fail('No selected room is available for every session in this series');
  const linkedEventIds = [];
  try {
    for (const a of appointments) {
      const linkedId = a.officeEventId || recoverable.get(a.id);
      const event = linkedId ? await OfficeEvent.findById(linkedId) : await OfficeEvent.createIfRoomOpen({
        officeLocationId: office.id, roomId: chosen.id, startAt: a.startAt, endAt: a.endAt,
        status: 'BOOKED', slotState: 'ASSIGNED_BOOKED', assignedProviderId: a.providerUserId, bookedProviderId: a.providerUserId,
        clientId: request.client_id, source: 'PROVIDER_REQUEST', notes: request.requester_notes,
        ...selection, sessionContext: { ...context, appointmentId: a.id, appointmentSeriesId: null, officeRequestId: request.id },
        createdByUserId: actorUserId, approvedByUserId: actorUserId });
      const { ensureAppointmentContext } = await import('./appointmentContext.service.js');
      await ensureAppointmentContext({ officeEventId: event.id, agencyId: context.agencyId, clientId: request.client_id,
        sessionContext: { ...context, appointmentId: a.id, appointmentSeriesId: null }, actorUserId });
      await Appointment.update(a.id, { officeBookingRequestId: request.id });
      linkedEventIds.push(Number(event.id));
    }
  } catch (error) {
    error.linkedEventIds = linkedEventIds;
    error.message = `Office request ${request.id} needs completion; retry this request instead of creating another. ${error.message}`;
    throw error;
  }
  OfficeScheduleMaterializer.invalidateOffice(office.id);
  return linkedEventIds;
}
