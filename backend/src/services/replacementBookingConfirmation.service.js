import pool from '../config/database.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

export async function replacementAttendanceDetails(appointment) {
  if (['VIRTUAL','TELEHEALTH','VIDEO','ONLINE'].includes(String(appointment.modality).toUpperCase())) return 'Virtual appointment. Open your secure portal for joining details.';
  if (!appointment.officeLocationId || !appointment.roomId) return 'In-person appointment. Check the location with your care team.';
  const [[room]] = await pool.execute(`SELECT l.name,l.street_address,l.city,l.state,l.postal_code,r.room_number,r.label,r.name AS room_name
    FROM office_rooms r JOIN office_locations l ON l.id=r.location_id WHERE r.id=? AND l.id=?`, [appointment.roomId,appointment.officeLocationId]);
  if (!room) return 'In-person appointment. Check the location with your care team.';
  return ['In person', room.name, room.room_number ? `Room ${room.room_number}` : room.label || room.room_name,
    room.street_address, [room.city,room.state,room.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
}

export async function finalizeReplacementBooking(offer, appointmentId, actorUserId) {
  const [completed] = await pool.execute(`SELECT id FROM appointment_schedule_notices
    WHERE appointment_id=? AND client_id=? AND agency_id=? AND event_type='created' LIMIT 1`, [appointmentId,offer.client_id,offer.agency_id]);
  if (completed[0]?.id) return;
  const Appointment = (await import('../models/Appointment.model.js')).default;
  const original = await Appointment.findById(offer.appointment_id);
  const [notices] = await pool.execute(`SELECT payload_json FROM appointment_schedule_notices
    WHERE appointment_id=? AND client_id=? AND agency_id=? AND event_type IN ('canceled','rescheduled') ORDER BY id DESC LIMIT 1`,
  [offer.appointment_id,offer.client_id,offer.agency_id]);
  const previous = notices[0] && JSON.parse(maybeDecryptNotePayload(typeof notices[0].payload_json === 'string' ? notices[0].payload_json : JSON.stringify(notices[0].payload_json)));
  // Carry the reviewed contact/channel selection forward, never the cancellation
  // message. Ongoing reminder preferences remain the recipient's own settings.
  const facts = { replacementForAppointmentId:offer.appointment_id, replacementOriginalStartAt:original?.startAt, reviewedCancellation:true };
  if (previous?.facts?.notificationRecipients) facts.notificationRecipients = previous.facts.notificationRecipients.filter(c=>Number(c.clientId)===Number(offer.client_id));
  const { scheduleSessionNotifications } = await import('./sessionNotification.service.js');
  // Unlike the generic best-effort create path, failures surface and a repeated
  // approval repairs reminders on the same booking instead of duplicating it.
  await scheduleSessionNotifications(appointmentId,{replace:true});
  const { appointmentScheduleNotices } = await import('./appointmentScheduleNotice.service.js');
  await appointmentScheduleNotices.queue(appointmentId,{eventType:'created',facts,actorUserId});
}
