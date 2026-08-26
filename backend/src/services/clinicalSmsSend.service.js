import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import MessageLog from '../models/MessageLog.model.js';
import UserCallSettings from '../models/UserCallSettings.model.js';
import SmsOptInState from '../models/SmsOptInState.model.js';
import SmsThreadEscalation from '../models/SmsThreadEscalation.model.js';
import AgencyContact from '../models/AgencyContact.model.js';
import ContactCommunicationLog from '../models/ContactCommunicationLog.model.js';
import NotificationGatekeeperService from './notificationGatekeeper.service.js';
import VonageService from './vonage.service.js';
import { resolveOutboundNumber } from './communicationRouting.service.js';

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function parseIntOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function getAgencyIdsForUser(userId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || [])
    .map((a) => Number(a?.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

async function assertClientAgencyAccess(userId, client) {
  const clientAgencyId = client?.agency_id ? Number(client.agency_id) : null;
  if (!clientAgencyId) return true;
  const agencyIds = await getAgencyIdsForUser(userId);
  if (!agencyIds.includes(clientAgencyId)) {
    const err = new Error('Access denied to this client');
    err.status = 403;
    throw err;
  }
  return true;
}

/**
 * Send a clinical 1:1 SMS (shared by Messages hub and Unified Inbox SMS threads).
 */
export async function sendClinicalSms({
  userId,
  clientId = null,
  contactId = null,
  body,
  numberId = null,
  mediaUrls = null,
  auditUserId = null
} = {}) {
  const uid = parseIntOrNull(userId);
  const cid = parseIntOrNull(clientId);
  const aid = parseIntOrNull(contactId);
  const hasMedia = Array.isArray(mediaUrls) && mediaUrls.length > 0;
  const text = String(body || '').trim();

  if ((!cid && !aid) || (!text && !hasMedia)) {
    throw Object.assign(new Error('(clientId or contactId) and (body or mediaUrls) are required'), { status: 400 });
  }

  const user = await User.findById(uid);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  let targetPhone = null;
  let targetAgencyId = null;

  if (cid) {
    const client = await Client.findById(cid, { includeSensitive: true });
    if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
    await assertClientAgencyAccess(uid, client);
    targetPhone = client.contact_phone;
    targetAgencyId = client.agency_id;
  } else if (aid) {
    const contact = await AgencyContact.findById(aid);
    if (!contact) throw Object.assign(new Error('Contact not found'), { status: 404 });
    targetPhone = contact.phone;
    targetAgencyId = contact.agency_id;
  }

  if (!targetPhone) {
    throw Object.assign(new Error('Recipient does not have a contact phone assigned'), { status: 400 });
  }

  const resolved = await resolveOutboundNumber({
    userId: uid,
    clientId: cid,
    requestedNumberId: numberId ? parseIntOrNull(numberId) : null
  });
  if (resolved?.error === 'number_unavailable') {
    throw Object.assign(new Error('Selected number is unavailable'), { status: 404 });
  }
  if (resolved?.error === 'number_not_assigned') {
    throw Object.assign(new Error('Selected number is not assigned to you'), { status: 403 });
  }
  if (resolved?.error === 'number_not_accessible') {
    throw Object.assign(new Error('Selected number is not accessible for this agency'), { status: 403 });
  }
  if (!resolved?.number) {
    throw Object.assign(
      new Error(
        'You need a texting number assigned to you to send messages. Contact your administrator to get a number assigned.'
      ),
      { status: 400 }
    );
  }

  const callSettings = await UserCallSettings.getByUserId(uid);
  const smsOutboundEnabled = callSettings?.sms_outbound_enabled !== false && callSettings?.sms_outbound_enabled !== 0;
  if (!smsOutboundEnabled) {
    throw Object.assign(new Error('Outbound texting is disabled in your communication settings.'), { status: 403 });
  }

  if (cid) {
    const activeEscalation = await SmsThreadEscalation.findActive({ userId: uid, clientId: cid }).catch(() => null);
    if (activeEscalation && activeEscalation.thread_mode === 'read_only') {
      throw Object.assign(
        new Error('This thread is currently escalated to support in read-only mode for the provider.'),
        { status: 403 }
      );
    }
  }

  const fromNumber = resolved.number.phone_number;
  const resolvedNumberId = resolved?.number?.id || null;
  const ownerType = resolved?.ownerType || (resolved?.number ? 'agency' : 'staff');
  const assignedUserId = resolved?.assignment?.user_id || uid;

  const agency = targetAgencyId ? await Agency.findById(targetAgencyId) : null;
  const flags = parseFeatureFlags(agency?.feature_flags);
  const complianceMode = String(flags.smsComplianceMode || 'opt_in_required');
  if (resolvedNumberId && cid) {
    const optState = await SmsOptInState.findByClientNumber({ clientId: cid, numberId: resolvedNumberId });
    const optStatus = optState?.status || 'pending';
    if (optStatus === 'opted_out') {
      throw Object.assign(new Error('Client has opted out of SMS'), { status: 403 });
    }
    if (complianceMode === 'opt_in_required' && optStatus !== 'opted_in') {
      throw Object.assign(new Error('Client has not opted in to SMS yet'), { status: 403 });
    }
  }

  const decision = await NotificationGatekeeperService.decideChannels({
    userId: uid,
    context: { severity: 'info' }
  });

  const outboundMetadata = { provider: 'vonage', gatekeeper: decision, numberId: resolvedNumberId };
  if (hasMedia) outboundMetadata.media_urls = mediaUrls;

  const outboundLog = await MessageLog.createOutbound({
    agencyId: targetAgencyId || null,
    userId: uid,
    assignedUserId,
    numberId: resolvedNumberId,
    ownerType,
    clientId: cid,
    agencyContactId: aid,
    body: text || (hasMedia ? '[MMS]' : ''),
    fromNumber,
    toNumber: targetPhone,
    deliveryStatus: 'pending',
    providerMessageSid: null,
    metadata: outboundMetadata
  });

  try {
    const msg = await VonageService.sendSms({
      to: MessageLog.normalizePhone(targetPhone) || targetPhone,
      from: MessageLog.normalizePhone(fromNumber) || fromNumber,
      body: text || '',
      mediaUrl: hasMedia ? mediaUrls : null
    });
    const sentMetadata = { provider: 'vonage', status: msg.status, gatekeeper: decision };
    if (hasMedia) sentMetadata.media_urls = mediaUrls;
    const updated = await MessageLog.markSent(outboundLog.id, msg.sid, sentMetadata);

    try {
      const matchedContact =
        aid ? await AgencyContact.findById(aid) : await AgencyContact.findByPhone(targetPhone, targetAgencyId);
      if (matchedContact) {
        const existing = await ContactCommunicationLog.findByExternalRefId(String(outboundLog.id));
        if (!existing) {
          await ContactCommunicationLog.create({
            contactId: matchedContact.id,
            channel: 'sms',
            direction: 'outbound',
            body: text,
            externalRefId: String(outboundLog.id),
            metadata: { fromNumber, toNumber: targetPhone, messageLogId: outboundLog.id }
          });
        }
      }
    } catch {
      /* best-effort */
    }

    try {
      const { recordSmsProfileAudit } = await import('./smsProfileAudit.service.js');
      await recordSmsProfileAudit({
        agencyId: targetAgencyId || null,
        direction: 'OUTBOUND',
        fromNumber,
        toNumber: targetPhone,
        numberId: resolvedNumberId,
        numberPurpose: resolved?.number?.number_purpose || null,
        body: text || (hasMedia ? '[MMS]' : ''),
        messageLogId: updated?.id || outboundLog?.id || null,
        clientId: cid || null
      });
    } catch {
      /* best-effort */
    }

    if (cid) {
      await SmsThreadEscalation.resolveActive({ userId: uid, clientId: cid }).catch(() => {});
    }

    return {
      messageLog: updated,
      clientId: cid,
      contactId: aid,
      auditUserId: auditUserId || uid
    };
  } catch (sendErr) {
    await MessageLog.markFailed(outboundLog.id, sendErr.message);
    const err = Object.assign(new Error('Failed to send SMS via Vonage'), { status: 502 });
    err.details = sendErr.message;
    throw err;
  }
}

export function parseSmsConversationTarget(conversation) {
  const ext = String(conversation?.external_thread_id || '');
  let clientId = null;
  let contactId = null;
  const clientMatch = ext.match(/^sms:client:(\d+)$/);
  const contactMatch = ext.match(/^sms:contact:(\d+)$/);
  if (clientMatch) clientId = Number(clientMatch[1]);
  else if (contactMatch) contactId = Number(contactMatch[1]);
  return { clientId, contactId };
}
