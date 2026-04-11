/**
 * Vonage inbound SMS webhook controller.
 *
 * Vonage webhook payload (JSON, POST):
 *   msisdn   - sender phone number
 *   to       - your Vonage virtual number
 *   text     - message body
 *   messageId (or message-id) - Vonage message ID
 *   type     - "text" | "binary" | "unicode"
 *   media    - array of media objects for MMS (Messages API)
 *
 * Vonage expects HTTP 200 in response (no TwiML XML needed).
 */

import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import UserCallSettings from '../models/UserCallSettings.model.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import MessageLog from '../models/MessageLog.model.js';
import MessageAutoReplyThrottle from '../models/MessageAutoReplyThrottle.model.js';
import NotificationGatekeeperService from '../services/notificationGatekeeper.service.js';
import VonageService from '../services/vonage.service.js';
import TwilioNumberRule from '../models/TwilioNumberRule.model.js';
import TwilioOptInState from '../models/TwilioOptInState.model.js';
import SmsThreadEscalation from '../models/SmsThreadEscalation.model.js';
import Agency from '../models/Agency.model.js';
import { resolveInboundRoute } from '../services/twilioNumberRouting.service.js';
import { handleAgencyCampaignInbound } from './agencyCampaigns.controller.js';
import { handleCompanyEventInbound } from './companyEvents.controller.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import AgencyContact from '../models/AgencyContact.model.js';
import ContactCommunicationLog from '../models/ContactCommunicationLog.model.js';

async function getAgencyIdForUser(userId) {
  const agencies = await User.getAgencies(userId);
  return agencies?.[0]?.id || null;
}

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function parseInboundKeyword(body) {
  const msg = String(body || '').trim().toUpperCase();
  if (!msg) return null;
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END'].includes(msg)) return 'STOP';
  if (['START', 'UNSTOP', 'YES'].includes(msg)) return 'START';
  if (['HELP', 'INFO'].includes(msg)) return 'HELP';
  return null;
}

async function getRuleMessage(numberId, ruleType, fallbackMessage) {
  if (!numberId) return fallbackMessage;
  const rule = await TwilioNumberRule.getActiveRule(numberId, ruleType);
  return rule?.auto_reply_text || fallbackMessage;
}

async function forwardEmergency({ numberId, agencyId, body, fromNumber }) {
  if (!numberId) return;
  const rule = await TwilioNumberRule.getActiveRule(numberId, 'emergency_forward');
  if (!rule || rule.enabled === 0) return;
  const msg = String(body || '').toLowerCase();
  const isEmergency = msg.includes('emergency') || msg.includes('urgent');
  if (!isEmergency) return;
  if (rule.forward_to_user_id) {
    await createNotificationAndDispatch(
      {
        type: 'inbound_client_message',
        severity: 'urgent',
        title: 'Emergency SMS forwarded',
        message: `Emergency text from ${fromNumber || 'client'}.`,
        userId: rule.forward_to_user_id,
        agencyId,
        relatedEntityType: 'message_log',
        relatedEntityId: null,
        actorSource: 'Vonage'
      },
      { context: { isUrgent: true } }
    );
  }
  if (rule.forward_to_phone) {
    try {
      await VonageService.sendSms({
        to: MessageLog.normalizePhone(rule.forward_to_phone) || rule.forward_to_phone,
        from: MessageLog.normalizePhone(fromNumber) || fromNumber,
        body
      });
    } catch (e) {
      console.warn('[VonageWebhook] Emergency forward SMS failed:', e.message);
    }
  }
}

function buildForwardBody(template, { body, from }) {
  const fallback = `Inbound text from ${from || 'client'}: ${body || ''}`.trim();
  if (!template) return fallback;
  return String(template)
    .replace(/{{\s*from\s*}}/gi, from || '')
    .replace(/{{\s*body\s*}}/gi, body || '')
    .trim() || fallback;
}

async function forwardInboundToUser({ number, body, from, userId }) {
  if (!userId) return;
  const user = await User.findById(userId);
  if (!user) return;
  const prefs = await UserPreferences.findByUserId(userId);
  if (prefs?.sms_forwarding_enabled === false || prefs?.sms_forwarding_enabled === 0) return;
  const toRaw = user?.personal_phone || user?.work_phone || user?.phone_number || null;
  if (!toRaw) return;
  const to = MessageLog.normalizePhone(toRaw) || toRaw;
  const fromNum = MessageLog.normalizePhone(number?.phone_number) || number?.phone_number || from;
  await VonageService.sendSms({ to, from: fromNum, body });
}

async function forwardInboundToPhone({ number, body, from, phone }) {
  if (!phone) return;
  const to = MessageLog.normalizePhone(phone) || phone;
  const fromNum = MessageLog.normalizePhone(number?.phone_number) || number?.phone_number || from;
  await VonageService.sendSms({ to, from: fromNum, body });
}

async function listSupportStaffIdsForAgency(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON u.id = ua.user_id
     WHERE ua.agency_id = ?
     AND u.role = 'support'
     AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
    [agencyId]
  );
  return rows.map((r) => r.id);
}

export const inboundSmsWebhook = async (req, res, next) => {
  try {
    // Vonage sends JSON on POST; on GET (dashboard "Webhook format: GET") params are in query.
    const body_payload = { ...(req.query || {}), ...(req.body || {}) };
    const from = body_payload.msisdn || body_payload.from || null;
    const to = body_payload.to || null;
    const body = body_payload.text || body_payload.body || '';
    const messageId = body_payload.messageId || body_payload['message-id'] || null;

    // Vonage expects 200 immediately; respond first if routing fails.
    if (!from || !to) {
      return res.status(200).json({ ok: true });
    }

    // Normalize to E.164 format for consistency with existing routing logic.
    const fromNorm = from.startsWith('+') ? from : `+${from}`;
    const toNorm = to.startsWith('+') ? to : `+${to}`;

    // Extract MMS media URLs (Vonage Messages API sends media array).
    const mediaUrls = [];
    if (Array.isArray(body_payload.media)) {
      for (const m of body_payload.media) {
        if (m?.url) mediaUrls.push(m.url);
      }
    }

    const companyEventHandled = await handleCompanyEventInbound({ from: fromNorm, to: toNorm, body });
    if (companyEventHandled?.handled) {
      return res.status(200).json({ ok: true, message: companyEventHandled.responseMessage || 'Thanks!' });
    }

    const campaignHandled = await handleAgencyCampaignInbound({ from: fromNorm, to: toNorm, body });
    if (campaignHandled?.handled) {
      return res.status(200).json({ ok: true, message: campaignHandled.responseMessage || 'Thanks!' });
    }

    const route = await resolveInboundRoute({ toNumber: toNorm, fromNumber: fromNorm });
    const ownerUser = route.ownerUser;
    const number = route.number;
    const numberId = number?.id || null;
    const ownerType = route.ownerType || null;
    const assignedUserId = route.assignment?.user_id || ownerUser?.id || null;
    const eligibleUserIds = route.eligibleUserIds || (ownerUser ? [ownerUser.id] : []);

    if (!ownerUser && !number) {
      return res.status(200).json({ ok: true });
    }

    const client = route.client || (await Client.findByContactPhone(fromNorm));
    const agencyId = route.agencyId || (ownerUser ? await getAgencyIdForUser(ownerUser.id) : null);
    const clientId = client?.id || null;

    const keyword = parseInboundKeyword(body);
    if (numberId && clientId && keyword === 'STOP') {
      await TwilioOptInState.upsert({ agencyId, clientId, numberId, status: 'opted_out', source: 'client_stop' });
    } else if (numberId && clientId && keyword === 'START') {
      await TwilioOptInState.upsert({ agencyId, clientId, numberId, status: 'opted_in', source: 'client_start' });
    } else if (numberId && clientId) {
      await TwilioOptInState.upsert({ agencyId, clientId, numberId, status: 'opted_in', source: 'inbound_message' });
    }

    const metadata = { provider: 'vonage', numberId };
    if (mediaUrls.length > 0) metadata.media_urls = mediaUrls;

    const inboundLog = await MessageLog.createInbound({
      agencyId,
      userId: ownerUser?.id || assignedUserId,
      assignedUserId,
      numberId,
      ownerType,
      clientId,
      body: body || (mediaUrls.length > 0 ? '[MMS]' : ''),
      fromNumber: fromNorm,
      toNumber: toNorm,
      twilioMessageSid: messageId,
      metadata
    });

    if (agencyId && fromNorm && inboundLog?.id) {
      try {
        const contact = await AgencyContact.findByPhone(fromNorm, agencyId);
        if (contact) {
          await ContactCommunicationLog.create({
            contactId: contact.id,
            channel: 'sms',
            direction: 'inbound',
            body: body || '',
            externalRefId: String(inboundLog.id),
            metadata: { from_number: fromNorm, to_number: toNorm, message_log_id: inboundLog.id }
          });
        }
      } catch (e) {
        console.warn('[VonageWebhook] Contact comm log (inbound) failed:', e.message);
      }
    }

    await logAuditEvent(req, {
      actionType: 'sms_inbound_received',
      agencyId,
      userId: ownerUser?.id || assignedUserId || null,
      metadata: { clientId, messageLogId: inboundLog?.id || null, numberId, ownerType, hasKeyword: !!keyword }
    });

    const prefs = ownerUser ? await UserPreferences.findByUserId(ownerUser.id) : null;

    if (agencyId && ownerUser?.id) {
      const agency = await Agency.findById(agencyId);
      const flags = parseFeatureFlags(agency?.feature_flags);
      const mirrorEnabled = prefs?.sms_support_mirror_enabled === true || prefs?.sms_support_mirror_enabled === 1;
      const supportPhone = MessageLog.normalizePhone(flags.smsSupportFallbackPhone || agency?.phone_number) ||
        flags.smsSupportFallbackPhone || agency?.phone_number || null;
      if (mirrorEnabled && supportPhone && clientId && (number?.phone_number || ownerUser?.system_phone_number)) {
        try {
          const supportBody = `Support mirror: inbound text from ${client?.initials || `client #${clientId || 'unknown'}`}. Message: "${String(body || '').slice(0, 180)}"`;
          await VonageService.sendSms({
            to: supportPhone,
            from: MessageLog.normalizePhone(number?.phone_number || ownerUser.system_phone_number) || number?.phone_number || ownerUser.system_phone_number,
            body: supportBody
          });
          await SmsThreadEscalation.createOrKeep({
            agencyId,
            userId: ownerUser.id,
            clientId,
            inboundLogId: inboundLog?.id || null,
            escalatedToPhone: supportPhone,
            escalationType: 'provider_mirror',
            threadMode: prefs?.sms_support_thread_mode === 'read_only' ? 'read_only' : 'respondable',
            metadata: { mirrored: true }
          });
        } catch (e) {
          console.warn('[VonageWebhook] Support mirror SMS failed:', e.message);
        }
      }
    }

    if (keyword === 'STOP' && numberId && clientId) {
      await logAuditEvent(req, {
        actionType: 'sms_opt_out', agencyId,
        userId: ownerUser?.id || assignedUserId || null,
        metadata: { clientId, numberId, messageLogId: inboundLog?.id || null }
      });
      const msg = await getRuleMessage(numberId, 'opt_out', 'You have been opted out. Reply START to rejoin.');
      // Vonage does not need TwiML; send reply programmatically if needed.
      if (number?.phone_number && fromNorm) {
        try {
          await VonageService.sendSms({ to: fromNorm, from: toNorm, body: msg });
        } catch (e) {
          console.warn('[VonageWebhook] STOP reply failed:', e.message);
        }
      }
      return res.status(200).json({ ok: true });
    }
    if (keyword === 'START' && numberId && clientId) {
      await logAuditEvent(req, {
        actionType: 'sms_opt_in', agencyId,
        userId: ownerUser?.id || assignedUserId || null,
        metadata: { clientId, numberId, messageLogId: inboundLog?.id || null }
      });
      const msg = await getRuleMessage(numberId, 'opt_in', 'You are opted in. Reply STOP to unsubscribe.');
      if (number?.phone_number && fromNorm) {
        try {
          await VonageService.sendSms({ to: fromNorm, from: toNorm, body: msg });
        } catch (e) {
          console.warn('[VonageWebhook] START reply failed:', e.message);
        }
      }
      return res.status(200).json({ ok: true });
    }
    if (keyword === 'HELP' && numberId) {
      const msg = await getRuleMessage(numberId, 'help', 'Reply STOP to opt out. Reply START to opt in.');
      if (number?.phone_number && fromNorm) {
        try {
          await VonageService.sendSms({ to: fromNorm, from: toNorm, body: msg });
        } catch (e) {
          console.warn('[VonageWebhook] HELP reply failed:', e.message);
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (numberId && !keyword) {
      const forwardRule = await TwilioNumberRule.getActiveRule(numberId, 'forward_inbound');
      if (forwardRule && (forwardRule.forward_to_user_id || forwardRule.forward_to_phone)) {
        const forwardBody = buildForwardBody(forwardRule.auto_reply_text, { body, from: fromNorm });
        try {
          if (forwardRule.forward_to_user_id) {
            await forwardInboundToUser({ number, body: forwardBody, from: fromNorm, userId: forwardRule.forward_to_user_id });
          }
          if (forwardRule.forward_to_phone) {
            await forwardInboundToPhone({ number, body: forwardBody, from: fromNorm, phone: forwardRule.forward_to_phone });
          }
        } catch (e) {
          console.warn('[VonageWebhook] Inbound forward failed:', e.message);
        }
      }
    }

    let notifyUserIds = eligibleUserIds;
    if (eligibleUserIds.length > 0) {
      const withSmsInbound = [];
      for (const uid of eligibleUserIds) {
        const settings = await UserCallSettings.getByUserId(uid);
        const enabled = settings?.sms_inbound_enabled !== false && settings?.sms_inbound_enabled !== 0;
        if (enabled) withSmsInbound.push(uid);
      }
      notifyUserIds = withSmsInbound;
    }

    if (agencyId && notifyUserIds.length > 0) {
      const clinicianName = ownerUser ? `${ownerUser.first_name} ${ownerUser.last_name?.slice(0, 1) || ''}.` : 'assigned clinician';
      for (const userId of notifyUserIds) {
        await createNotificationAndDispatch(
          {
            type: 'inbound_client_message',
            severity: 'urgent',
            title: 'New inbound client message',
            message: client?.initials ? `New message from client ${client.initials}.` : 'New inbound message received.',
            userId,
            agencyId,
            relatedEntityType: 'message_log',
            relatedEntityId: inboundLog.id,
            actorSource: 'Vonage'
          },
          { context: { isUrgent: true } }
        );
      }

      const eligibleSet = new Set(notifyUserIds.map(Number));
      const supportIds = await listSupportStaffIdsForAgency(agencyId);
      for (const supportUserId of supportIds) {
        if (eligibleSet.has(Number(supportUserId))) continue;
        const supportSettings = await UserCallSettings.getByUserId(supportUserId);
        if (supportSettings?.sms_inbound_enabled === false || supportSettings?.sms_inbound_enabled === 0) continue;
        await createNotificationAndDispatch(
          {
            type: 'support_safety_net_alert',
            severity: 'urgent',
            title: 'Safety Net: inbound client message',
            message: client?.initials
              ? `Inbound message from ${client.initials} (${clinicianName})`
              : `Inbound message (${clinicianName})`,
            userId: supportUserId,
            agencyId,
            relatedEntityType: 'message_log',
            relatedEntityId: inboundLog.id,
            actorSource: 'Vonage'
          },
          { context: { isUrgent: true } }
        );
      }
    }

    const autoReplyEnabled = prefs?.auto_reply_enabled === true || prefs?.auto_reply_enabled === 1;
    const smsEnabled = prefs?.sms_enabled === true || prefs?.sms_enabled === 1;
    const ruleAutoReply = numberId ? await TwilioNumberRule.getActiveRule(numberId, 'after_hours') : null;
    const autoReplyMessage = ruleAutoReply?.auto_reply_text || prefs?.auto_reply_message || null;

    if ((autoReplyEnabled || ruleAutoReply) && smsEnabled && autoReplyMessage) {
      const decision = await NotificationGatekeeperService.decideChannels({
        userId: ownerUser?.id || assignedUserId,
        context: { severity: 'info' }
      });

      const isOutsideQuietHours = decision.reasonCodes?.includes('quiet_hours_outside_window');
      if (isOutsideQuietHours) {
        const last = await MessageAutoReplyThrottle.getLastSentAt(ownerUser.id, fromNorm);
        const lastDate = last ? new Date(last) : null;
        const now = new Date();
        const hoursSince = lastDate ? (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60) : Infinity;

        if (hoursSince >= 4) {
          try {
            if (ownerUser?.system_phone_number || number?.phone_number) {
              const outboundLog = await MessageLog.createOutbound({
                agencyId,
                userId: ownerUser?.id || assignedUserId,
                assignedUserId,
                numberId,
                ownerType,
                clientId,
                body: autoReplyMessage,
                fromNumber: number?.phone_number || ownerUser.system_phone_number,
                toNumber: fromNorm,
                deliveryStatus: 'pending',
                metadata: { autoReply: true, provider: 'vonage', numberId }
              });

              const msg = await VonageService.sendSms({
                to: MessageLog.normalizePhone(fromNorm) || fromNorm,
                from: MessageLog.normalizePhone(number?.phone_number || ownerUser.system_phone_number) || number?.phone_number || ownerUser.system_phone_number,
                body: autoReplyMessage
              });

              await MessageLog.markSent(outboundLog.id, msg.sid, { autoReply: true, provider: 'vonage', status: msg.status });
              if (ownerUser?.id) {
                await MessageAutoReplyThrottle.upsertNow(ownerUser.id, fromNorm);
              }
            }
          } catch (sendErr) {
            console.warn('[VonageWebhook] Auto-reply send failed:', sendErr.message);
          }
        }
      }
    }

    if (agencyId) {
      const agency = await Agency.findById(agencyId);
      const flags = parseFeatureFlags(agency?.feature_flags);
      const complianceMode = String(flags.smsComplianceMode || 'opt_in_required');
      if (complianceMode === 'opt_in_required' && numberId && clientId) {
        const optState = await TwilioOptInState.findByClientNumber({ clientId, numberId });
        if (optState?.status === 'opted_out') {
          return res.status(200).json({ ok: true });
        }
      }
    }

    await forwardEmergency({ numberId, agencyId, body, fromNumber: fromNorm });

    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * Vonage delivery status webhook.
 * Vonage calls this URL (set as `statusUrl` on your account or numbers) with delivery receipts.
 */
export const deliveryStatusWebhook = async (req, res) => {
  // Best-effort: log status updates to message_logs if we can match by messageId.
  try {
    const merged = { ...(req.query || {}), ...(req.body || {}) };
    const messageId = merged.messageId || merged['message-id'] || merged.message_id;
    const status = merged.status;
    if (messageId && status) {
      // Map Vonage status to a normalized value.
      const normalizedStatus = String(status).toLowerCase();
      await pool.execute(
        `UPDATE message_logs
         SET delivery_status = ?, updated_at = NOW()
         WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.sid')) = ?
            OR twilio_message_sid = ?`,
        [normalizedStatus, messageId, messageId]
      );
    }
  } catch (e) {
    console.warn('[VonageWebhook] deliveryStatusWebhook error:', e.message);
  }
  res.status(200).json({ ok: true });
};
