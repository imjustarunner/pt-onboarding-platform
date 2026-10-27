import { formatAppointmentTime } from './appointmentServiceSetting.service.js';
export const FAMILY_APPOINTMENT_LOGIN = 'For future sessions and information, please log in at https://auricwell.com.';
export function familyCancellationAttribution(appointment, facts = {}, recipientUserId = null) {
  const role = String(facts.cancellationActorRole || '').toLowerCase();
  const guardian = ['guardian','client_guardian'].includes(role) || appointment.status === 'canceled_by_guardian';
  const client = guardian || role === 'client' || appointment.status === 'canceled_by_client';
  const actorId = Number(facts.cancellationActorUserId || appointment.canceledByUserId || 0);
  const by = guardian
    ? actorId && Number(recipientUserId) === actorId ? 'you' : 'another parent or guardian on this account'
    : client ? 'the client' : appointment.status === 'canceled_by_organization' ? 'your care team' : 'your provider';
  return { familyInitiated: client,
    text: `The appointment on ${formatAppointmentTime(appointment)} was canceled by ${by}.` };
}
