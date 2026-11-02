import ClientGuardian from '../models/ClientGuardian.model.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

export function parseProviderReply(body) {
  const match = String(body || '').trim().match(/^([A-Z0-9]+-\d+-\d+)(?:\s*:\s*|\s+)([\s\S]+)$/i);
  return match && match[2].trim() ? { code: match[1].toUpperCase(), body: match[2].trim() } : null;
}
export function familyReplyCode(client, guardianId) {
  const initials = String(client.initials || 'CLIENT').replace(/[^a-z0-9]/gi, '').slice(0, 24).toUpperCase() || 'CLIENT';
  return `${initials}-${Number(client.id)}-${Number(guardianId) || 0}`;
}
// Resolve the exact sender, never a primary guardian or last-used contact.
export async function resolveRelayFamily(client, phone) {
  const normalized = normalizeSmsPhone(phone);
  if (!normalized || !client || client.compliance_archived_at || [true, 1, '1'].includes(client.is_archived)) return null;
  const links = await ClientGuardian.listForClient(client.id);
  const matching = links.filter(link => normalizeSmsPhone(link.phone) === normalized);
  if (matching.length) {
    if (matching.length !== 1 || ![true, 1].includes(matching[0].access_enabled)
      || ![true, 1].includes(matching[0].is_active)) return null;
    const guardian = matching[0];
    if (['TERMINATED', 'ARCHIVED', 'INACTIVE_EMPLOYEE'].includes(String(guardian.status || '').toUpperCase())) return null;
    const permissions = guardian.permissions_json || {};
    if (permissions.noView || permissions.noViewOtherGuardian || permissions.coGuardianInviteRestricted
      || permissions.canViewAppointments === false || permissions.canMessage === false) return null;
    return { phone: normalized, guardianUserId: Number(guardian.guardian_user_id),
      guardian: guardian.relationship_type !== 'self' };
  }
  return normalizeSmsPhone(client.contact_phone) === normalized
    ? { phone: normalized, guardianUserId: 0, guardian: false } : null;
}
