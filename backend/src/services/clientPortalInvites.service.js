import { resolveClientPortalContext } from './clientPortalContext.service.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { sendHubPortalInvitation } from './messagesHub.service.js';
import crypto from 'node:crypto';
import { previewStaffGuardianRetries, sendStaffSelectedGuardianRetry } from './coGuardianDelivery.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const roles = new Set(['super_admin', 'admin', 'support', 'staff', 'provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant']);
const previewChanged = message => Object.assign(fail(message,409),{code:'PORTAL_INVITATION_PREVIEW_CHANGED'});
const permissions = value => {try{const p=typeof value==='string'?JSON.parse(value):value||{};return p&&typeof p==='object'&&!Array.isArray(p)?p:null;}catch{return null;}};
const snapshot = recipient => crypto.createHash('sha256').update(JSON.stringify([
  recipient.kind,recipient.key,String(recipient.email||'').trim().toLowerCase(),recipient.name,
  recipient.clients.map(c=>[c.clientId,c.accessState]).sort((a,b)=>a[0]-b[0])
])).digest('hex');

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
  const byAgency = new Map();
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
    if(!context.learning){if(!byAgency.has(Number(client.agency_id)))byAgency.set(Number(client.agency_id),[]);byAgency.get(Number(client.agency_id)).push(clientId);}
    const guardians = await ClientGuardian.listForClient(clientId);
    let eligible = 0;
    let restricted = false;
    for (const guardian of guardians) {
      if (!['client_guardian', 'guardian', 'client'].includes(guardian.role)
        || ![1, true].includes(guardian.access_enabled)
        || guardian.is_active===0 || guardian.is_active===false
        || ['ARCHIVED', 'INACTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED', 'SUSPENDED'].includes(String(guardian.status).toUpperCase())
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardian.email || '')) continue;
      const access=permissions(guardian.permissions_json);
      if(!access || access.noView || access.noViewOtherGuardian || access.noContact || access.no_contact || access.contactRestricted || access.revoked || access.relationshipRevoked){
        restricted = true;
        skipped.push({clientId,label,reason:'This account has restricted portal access. A failed own-enrollment invitation, when eligible, is listed separately.'});
        continue;
      }
      eligible++;
      const key = `${client.agency_id}:${guardian.guardian_user_id}${context.learning ? `:learning:${context.portal.id}` : ''}`;
      if (!recipients.has(key)) recipients.set(key, {
        key, kind:'portal_account', agencyId: Number(client.agency_id), guardianUserId: Number(guardian.guardian_user_id),
        portalName: context.portal.name,
        name: [guardian.first_name, guardian.last_name].filter(Boolean).join(' '), email: guardian.email, clients: []
      });
      recipients.get(key).clients.push({ clientId, label,accessState:JSON.stringify([guardian.role,guardian.status,guardian.is_active??1,guardian.access_enabled,Object.entries(access).sort(([a],[b])=>a.localeCompare(b))]) });
    }
    if (!eligible && !restricted) skipped.push({ clientId, label, reason: 'Add a portal contact with an email and enabled access in the client profile.' });
  }
  const ownRecipients=[];
  for(const [agencyId,ids]of byAgency){
    const own=await previewStaffGuardianRetries({actorUserId:actor.id,agencyId,clientIds:ids});
    ownRecipients.push(...own.recipients);skipped.push(...own.skipped);
    const pendingEmails=new Set(own.pendingEmails);
    for(const[key,recipient]of recipients)if(recipient.agencyId===agencyId&&pendingEmails.has(String(recipient.email).trim().toLowerCase()))recipients.delete(key);
  }
  const portalRecipients=[...recipients.values()].map(recipient=>({
    ...recipient,snapshot:snapshot(recipient),clients:recipient.clients.map(({clientId,label})=>({clientId,label}))
  }));
  return { recipients: [...portalRecipients,...ownRecipients], skipped };
}

export async function sendClientPortalInvite({ actor, clientIds, recipientKey, recipientSnapshot }) {
  const preview = await previewClientPortalInvites({ actor, clientIds });
  const recipient = preview.recipients.find(r => r.key === recipientKey);
  if (!recipient || !recipientSnapshot || recipient.snapshot!==recipientSnapshot) throw previewChanged('This recipient or its access changed. Refresh the invitation preview before sending.');
  if(recipient.kind==='own_enrollment'){
    const delivery=await sendStaffSelectedGuardianRetry({actorUserId:actor.id,agencyId:recipient.agencyId,inviteId:recipient.invitationId,
      clientIds:recipient.clients.map(c=>c.clientId),snapshot:recipientSnapshot});
    const status=delivery.deliveryStatus==='sent'?(delivery.redirected?'redirected':'sent'):delivery.deliveryStatus==='pending'?'queued':delivery.deliveryStatus==='failed'?'failed':'unconfirmed';
    return {key:recipient.key,status,invitationId:delivery.invitationId,deliveryAttemptId:delivery.deliveryAttemptId,communicationId:delivery.communicationId||null};
  }
  // One email per account per agency, even when siblings share the account.
  // The existing invitation flow preserves each relationship's permissions.
  for (const client of recipient.clients) {
    await Client.update(client.clientId, { guardian_portal_enabled: 1 }, actor.id);
  }
  const result = await sendHubPortalInvitation({ agencyId: recipient.agencyId, actorUserId: actor.id,
    clientId: recipient.clients[0].clientId, guardianUserId: recipient.guardianUserId, existingLinkOnly: true,
    expectedRecipientEmail:recipient.email,selectedClientIds:recipient.clients.map(c=>c.clientId) });
  const delivery = result?.delivery;
  const status = delivery?.blocked || delivery?.skipped ? 'skipped'
    : delivery?.pendingApproval || delivery?.queued ? 'queued'
    : delivery?.redirected ? 'redirected' : delivery?.id ? 'sent' : 'unconfirmed';
  return { key: recipient.key, status, reason: delivery?.reason || null };
}
