import pool from '../config/database.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { moveOfficeSessionOccurrence } from './officeSessionMove.service.js';
import { ensureAppointmentClinicalLink } from './appointmentClinicalLink.service.js';
import { scheduleSessionNotifications } from './sessionNotification.service.js';

const asDate = (v) => v instanceof Date ? v : new Date(String(v).replace(' ', 'T').replace(/Z?$/, 'Z'));

export async function moveAppointmentOffice(appointment, startAt, endAt, actorUserId) {
  if (!appointment.officeEventId) return;
  const office = await OfficeLocation.findById(appointment.officeLocationId);
  await moveOfficeSessionOccurrence({ eventId: appointment.officeEventId, newRoomId: appointment.roomId, startAt, endAt,
    timeZone: office?.timezone || appointment.sourceTimezone, actorUserId });
}

export async function refreshAppointmentCalendar(appointment, actorUserId) {
  if (appointment.providerScheduleEventId) await pool.execute(`UPDATE provider_schedule_events SET start_at = ?, end_at = ?, updated_by_user_id = ? WHERE id = ?`,
    [appointment.startAt, appointment.endAt, actorUserId, appointment.providerScheduleEventId]);
  await ensureAppointmentClinicalLink(appointment.id, actorUserId);
  await scheduleSessionNotifications(appointment.id, { replace: true });
}

export async function releaseAppointmentCalendar(appointment, actorUserId) {
  // Use SQL for the calendar facet to avoid calling its appointment-cancellation hook recursively.
  if (appointment.providerScheduleEventId) await pool.execute("UPDATE provider_schedule_events SET status = 'CANCELLED', updated_by_user_id = ? WHERE id = ?",
    [actorUserId, appointment.providerScheduleEventId]);
  if (!appointment.officeEventId) return;
  const event = await OfficeEvent.findById(appointment.officeEventId);
  if (!event) return;
  if (event.booking_plan_id) {
    const office = await OfficeLocation.findById(event.office_location_id);
    await OfficeBookingPlan.addSkippedDate(event.booking_plan_id, utcDateToZonedYmd(asDate(event.start_at), office?.timezone || appointment.sourceTimezone || 'America/Denver'));
  }
  await OfficeEvent.cancelOccurrence({ eventId: event.id });
}
