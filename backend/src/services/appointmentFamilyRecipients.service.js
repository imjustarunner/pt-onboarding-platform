import ClientGuardian from '../models/ClientGuardian.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';

// Appointment logistics use the same relationship permissions as the portal.
// A second guardian's private enrollment/document permissions stay separate.
export async function appointmentFamilyRecipients(clientId, agencyId, overrides = {}) {
  const d = { guardians: id => ClientGuardian.listForClient(id),
    authorize: async (...args) => (await import('./guardianAppointments.service.js')).authorizedAppointmentClient(...args),
    ...overrides };
  const links = await d.guardians(clientId);
  const recipients = [];
  for (const guardian of links) {
    if (Number(guardian.access_enabled) !== 1 || (guardian.is_active != null && !Number(guardian.is_active)) || ['inactive','archived','terminated'].includes(String(guardian.status || '').toLowerCase())) continue;
    try { await d.authorize(guardian.guardian_user_id, clientId, { agencyId }); }
    catch (error) { if ([403,404].includes(error.status)) continue; throw error; }
    recipients.push({ key: `guardian:${guardian.guardian_user_id}`, userId: Number(guardian.guardian_user_id),
      role: guardian.relationship_type === 'self' ? 'client' : 'guardian',
      email: guardian.email || '', phone: PhoneNumber.normalizePhone(guardian.phone) || '' });
  }
  return { hasRelationships: links.length > 0, recipients };
}
