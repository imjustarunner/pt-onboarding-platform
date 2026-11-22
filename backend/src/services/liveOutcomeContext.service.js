import Appointment from '../models/Appointment.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import appointmentStaffTools from './appointmentStaffTools.service.js';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export async function liveOutcomeContext(client, appointmentId, user) {
  const id = Number(appointmentId);
  if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Choose a saved appointment.');
  // Shared clients can attend either affiliated agency. Require the existing
  // appointment permission gate plus this exact client/participant binding.
  const appointment = await appointmentStaffTools.authorize(user, id);
  const participants = await Appointment.listParticipants(id);
  if (!participants.some(person => Number(person.clientId) === Number(client.id))) fail(404, 'Appointment not found for this client.');
  const links = await ClientGuardian.listForClient(client.id);
  const guardians = links.filter(person => person.relationship_type !== 'self' && ['guardian', 'client_guardian'].includes(person.role)
    && Number(person.access_enabled) === 1 && Number(person.is_active) === 1 && !Number(person.is_archived) && !person.terminated_at
    && !['ARCHIVED', 'TERMINATED', 'INACTIVE'].includes(String(person.status || '').toUpperCase()) && !ClientGuardian.isNoView(person.permissions_json))
    .map(person => ({ id: Number(person.guardian_user_id), label: [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Guardian', relationship: person.relationship_title || 'Parent / guardian' }));
  return {
    appointment: { id, agencyId: appointment.agencyId, clinicalSessionId: appointment.clinicalSessionId || null, startAt: appointment.startAt, endAt: appointment.endAt },
    guardians
  };
}
export function liveOutcomeRespondent(measure, input, context, client) {
  if (!input || !['client', 'guardian', 'other'].includes(input.type)) fail(400, 'Identify who is answering this assessment.');
  if (input.type === 'client') {
    if (measure.respondent === 'caregiver' || measure.respondent === 'observer') fail(400, 'Choose the person completing this report or select a client self-report form.');
    return { type: 'client', clientId: Number(client.id), label: 'Client' };
  }
  if (input.type === 'guardian') {
    if (measure.respondent !== 'caregiver') fail(400, 'Choose a parent-report form when a guardian is answering about the client.');
    const guardian = context.guardians.find(person => person.id === Number(input.userId));
    if (!guardian) fail(400, 'Choose a current linked parent or guardian.');
    return { type: 'guardian', userId: guardian.id, label: guardian.label, relationship: guardian.relationship };
  }
  const label = String(input.label || '').trim(), relationship = String(input.relationship || '').trim();
  if (!label || label.length > 180 || !relationship || relationship.length > 120) fail(400, 'Enter the other respondent’s name or consistent identifier and relationship to the client.');
  return { type: 'other', label, relationship };
}
