import Appointment from '../models/Appointment.model.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { ensureAppointmentClinicalLink } from './appointmentClinicalLink.service.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import { moveOfficeSessionOccurrence } from './officeSessionMove.service.js';

export async function assertAppointmentCanMove(appointment) {
  if (!appointment) return;
  if (!['scheduled', 'confirmed'].includes(String(appointment.status))) {
    throw Object.assign(new Error('Only upcoming appointments can be moved; preserve completed and canceled sessions'), { status: 409 });
  }
  if (!appointment.clinicalSessionId) return;
  const [notes] = await clinicalPool.execute(
    `SELECT n.id FROM clinical_notes n JOIN clinical_sessions s ON s.id = n.clinical_session_id
     WHERE (s.appointment_id = ? OR s.id = ?) AND n.is_deleted = 0 AND n.provider_signed_at IS NOT NULL LIMIT 1`,
    [appointment.id, appointment.clinicalSessionId]
  );
  if (notes.length) throw Object.assign(new Error('This appointment has a signed note. Create a new appointment to preserve the signed record.'), { status: 409 });
}

export async function assertProviderEventCanMove(providerScheduleEventId, startAt, endAt) {
  const appointment = await Appointment.findByProviderScheduleEventId(providerScheduleEventId);
  if (!appointment) return;
  const instant = (v) => v instanceof Date ? v.getTime() : Date.parse(String(v).replace(' ', 'T').replace(/Z?$/, 'Z'));
  if ((startAt === undefined || instant(startAt) === instant(appointment.startAt))
    && (endAt === undefined || instant(endAt) === instant(appointment.endAt))) return;
  await assertAppointmentCanMove(appointment);
}

export async function moveOfficeFromProviderEvent(providerScheduleEventId, startAt, endAt, actorUserId) {
  const appointment = await Appointment.findByProviderScheduleEventId(providerScheduleEventId);
  if (!appointment?.officeEventId) return;
  const instant = (v) => v instanceof Date ? v.getTime() : Date.parse(String(v).replace(' ', 'T').replace(/Z?$/, 'Z'));
  if ((startAt === undefined || instant(startAt) === instant(appointment.startAt))
      && (endAt === undefined || instant(endAt) === instant(appointment.endAt))) return;
  const office = await OfficeLocation.findById(appointment.officeLocationId);
  await moveOfficeSessionOccurrence({ eventId: appointment.officeEventId, newRoomId: appointment.roomId,
    startAt: startAt ?? appointment.startAt, endAt: endAt ?? appointment.endAt, timeZone: office?.timezone || appointment.sourceTimezone,
    actorUserId });
}

// Calendar series edits call updateForProvider for every affected occurrence.
// Keep each appointment and its clinical service time aligned with that occurrence.
export async function syncAppointmentFromProviderEvent(event, actorUserId = null) {
  const appointment = await Appointment.findByProviderScheduleEventId(event.id);
  if (!appointment) return;
  await Appointment.update(appointment.id, {
    startAt: event.start_at, endAt: event.end_at, updatedByUserId: actorUserId
  });
  await ensureAppointmentClinicalLink(appointment.id, actorUserId);
  const { scheduleSessionNotifications } = await import('./sessionNotification.service.js');
  await scheduleSessionNotifications(appointment.id, { replace: true });
}

export async function cancelAppointmentsFromCalendar(eventIds, actorUserId) {
  const { cancelAppointment } = await import('./appointment.service.js');
  for (const eventId of eventIds) {
    const appointment = await Appointment.findByProviderScheduleEventId(eventId);
    if (!appointment || !['scheduled', 'confirmed'].includes(appointment.status)) continue;
    await cancelAppointment(appointment.id, { actorUserId, actorRole: 'provider', reason: 'Provider calendar session canceled' });
  }
}
