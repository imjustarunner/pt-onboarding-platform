import { resolveClientPortalContext } from './clientPortalContext.service.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { sendHubPortalInvitation } from './messagesHub.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const roles = new Set(['super_admin', 'admin', 'support', 'staff', 'provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant']);

// Preview and send both resolve the same explicit client selection; never trust a
// browser-supplied email address or silently broaden a provider/school filter.
export async function previewClientPortalInvites({ actor, clientIds }) {
  if (!roles.has(String(actor?.role || '').toLowerCase())) throw fail('Staff portal invitation access required.', 403);
  if (!Array.isArray(clientIds) || !clientIds.length || clientIds.length > 200
    || clientIds.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    throw fail('Select between 1 and 200 clients.');
  }
  const recipients = new Map();
  const skipped = [];
  for (const clientId of [...new Set(clientIds.map(Number))]) {
    const access = await resolveClientRecordAccess({ userId: actor.id, role: actor.role, clientId });
    if (!access?.ok) throw fail('You do not have permission to invite every selected client.', 403);
    const client = await Client.findById(clientId);
    if (!client) throw fail('A selected client is no longer available.', 404);
    const label = client.initials || `Client ${clientId}`;
    if (['ARCHIVED', 'TERMINATED'].includes(String(client.status).toUpperCase())) {
      skipped.push({ clientId, label, reason: 'Inactive client' });
      continue;
    }
    const context = await resolveClientPortalContext(client);
    const guardians = await ClientGuardian.listForClient(clientId);
    let eligible = 0;
    for (const guardian of guardians) {
      if (!['client_guardian', 'guardian', 'client'].includes(guardian.role)
        || ![1, true].includes(guardian.access_enabled)
        || ['ARCHIVED', 'INACTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED', 'SUSPENDED'].includes(String(guardian.status).toUpperCase())
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardian.email || '')) continue;
      eligible++;
      const key = `${client.agency_id}:${guardian.guardian_user_id}${context.learning ? `:learning:${context.portal.id}` : ''}`;
      if (!recipients.has(key)) recipients.set(key, {
        key, agencyId: Number(client.agency_id), guardianUserId: Number(guardian.guardian_user_id),
        portalName: context.portal.name,
        name: [guardian.first_name, guardian.last_name].filter(Boolean).join(' '), email: guardian.email, clients: []
      });
      recipients.get(key).clients.push({ clientId, label });
    }
    if (!eligible) skipped.push({ clientId, label, reason: 'Add a portal contact with an email and enabled access in the client profile.' });
  }
  return { recipients: [...recipients.values()], skipped };
}

export async function sendClientPortalInvite({ actor, clientIds, recipientKey }) {
  const preview = await previewClientPortalInvites({ actor, clientIds });
  const recipient = preview.recipients.find(r => r.key === recipientKey);
  if (!recipient) throw fail('This recipient is no longer eligible. Refresh the invitation preview.', 409);
  // One email per account per agency, even when siblings share the account.
  // The existing invitation flow preserves each relationship's permissions.
  for (const client of recipient.clients) {
    await Client.update(client.clientId, { guardian_portal_enabled: 1 }, actor.id);
  }
  const result = await sendHubPortalInvitation({ agencyId: recipient.agencyId, actorUserId: actor.id,
    clientId: recipient.clients[0].clientId, guardianUserId: recipient.guardianUserId, existingLinkOnly: true });
  const delivery = result?.delivery;
  const status = delivery?.blocked || delivery?.skipped ? 'skipped'
    : delivery?.pendingApproval || delivery?.queued ? 'queued'
    : delivery?.redirected ? 'redirected' : delivery?.id ? 'sent' : 'unconfirmed';
  return { key: recipient.key, status, reason: delivery?.reason || null };
}
