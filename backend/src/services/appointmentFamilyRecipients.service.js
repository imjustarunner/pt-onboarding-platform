import ClientGuardian from '../models/ClientGuardian.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import pool from '../config/database.js';
import { ageOn } from './guardianClinicalAccess.service.js';

// An appointment update is permitted contact, not a grant of portal access.
// Portal availability is intentionally off for pre-EHR school clients. Do not
// enable it or disclose clinical records merely to send their absence notice.
export async function authorizedAppointmentNoticeRecipient(userId, clientId, { agencyId }, overrides = {}) {
  const d = { database:pool, link:args=>ClientGuardian.getLink(args),
    adult:async (...args)=>(await import('./guardianAppointments.service.js')).authorizedAppointmentClient(...args), ...overrides };
  const link = await d.link({clientId,guardianUserId:userId});
  const permissions = ClientGuardian.parsePermissions(link?.permissions_json) || {};
  if (!Number(link?.access_enabled) || ClientGuardian.isNoView(permissions) || permissions.coGuardianInviteRestricted || permissions.canViewAppointments === false) throw Object.assign(new Error('Appointment notifications are not authorized for this relationship.'), {status:403});
  const [[client]] = await d.database.execute(`SELECT c.id,c.date_of_birth FROM clients c WHERE c.id=?
    AND (c.agency_id=? OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))`, [clientId,agencyId,agencyId]);
  if (!client) throw Object.assign(new Error('Client is not enrolled with this agency.'), {status:403});
  // Retain the existing adult disclosure review; a childhood relationship does
  // not by itself permit scheduling information about an adult.
  if (link.relationship_type !== 'self' && ageOn(client.date_of_birth) >= 18) await d.adult(userId,clientId,{agencyId});
  return client;
}

// Appointment logistics use the same relationship permissions as the portal.
// A second guardian's private enrollment/document permissions stay separate.
export async function appointmentFamilyRecipients(clientId, agencyId, overrides = {}) {
  const d = { guardians: id => ClientGuardian.listForClient(id),
    authorize: authorizedAppointmentNoticeRecipient,
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
