import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import MessageLog from '../models/MessageLog.model.js';
import MessageAutoReplyThrottle from '../models/MessageAutoReplyThrottle.model.js';
import NotificationGatekeeperService from '../services/notificationGatekeeper.service.js';
import TwilioService from '../services/twilio.service.js';
import TwilioNumberRule from '../models/TwilioNumberRule.model.js';
import TwilioOptInState from '../models/TwilioOptInState.model.js';
import SmsThreadEscalation from '../models/SmsThreadEscalation.model.js';
import Agency from '../models/Agency.model.js';
import { resolveInboundRoute } from '../services/twilioNumberRouting.service.js';
import { handleAgencyCampaignInbound } from './agencyCampaigns.controller.js';
import { handleCompanyEventInbound } from './companyEvents.controller.js';

function twimlResponse(message) {
  // Minimal TwiML response
  const safe = String(message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

async function getAgencyIdForUser(userId) {
  const agencies = await User.getAgencies(userId);
  return agencies?.[0]?.id || null;
}

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function parseInboundKeyword(body) {
  const msg = String(body || '').trim().toUpperCase();
  if (!msg) return null;
  if (msg === 'STOP' || msg === 'STOPALL' || msg === 'UNSUBSCRIBE' || msg === 'CANCEL' || msg === 'END') return 'STOP';
  if (msg === 'START' || msg === 'UNSTOP' || msg === 'YES') return 'START';
  if (msg === 'HELP' || msg === 'INFO') return 'HELP';
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
        relatedEntityId: null
      },
      { context: { isUrgent: true } }
    );
  }
  if (rule.forward_to_phone) {
    try {
      await TwilioService.sendSms({
        to: MessageLog.normalizePhone(rule.forward_to_phone) || rule.forward_to_phone,
        from: MessageLog.normalizePhone(fromNumber) || fromNumber,
        body
      });
    } catch (e) {
      console.warn('Emergency forward SMS failed:', e.message);
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
  if (prefs?.sms_forwarding_enabled === false || prefs?.sms_forwarding_enabled === 0) {
    return;
  }
  const toRaw = user?.personal_phone || user?.work_phone || user?.phone_number || null;
  if (!toRaw) return;
  const to = MessageLog.normalizePhone(toRaw) || toRaw;
  const fromNum = MessageLog.normalizePhone(number?.phone_number) || number?.phone_number || from;
  await TwilioService.sendSms({ to, from: fromNum, body });
}

async function forwardInboundToPhone({ number, body, from, phone }) {
  if (!phone) return;
  const to = MessageLog.normalizePhone(phone) || phone;
  const fromNum = MessageLog.normalizePhone(number?.phone_number) || number?.phone_number || from;
  await TwilioService.sendSms({ to, from: fromNum, body });
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
    // Twilio sends x-www-form-urlencoded by default
    const from = req.body?.From;
    const to = req.body?.To;
    const body = req.body?.Body || '';
    const messageSid = req.body?.MessageSid || null;

    if (!from || !to) {
      return res.status(400).send('Missing From/To');
    }

    const companyEventHandled = await handleCompanyEventInbound({ from, to, body });
    if (companyEventHandled?.handled) {
      return res.status(200).type('text/xml').send(twimlResponse(companyEventHandled.responseMessage || 'Thanks!'));
    }

    const campaignHandled = await handleAgencyCampaignInbound({ from, to, body });
    if (campaignHandled?.handled) {
      return res.status(200).type('text/xml').send(twimlResponse(campaignHandled.responseMessage || 'Thanks!'));
    }

    const route = await resolveInboundRoute({ toNumber: to, fromNumber: from });
    const ownerUser = route.ownerUser;
    const number = route.number;
    const numberId = number?.id || null;
    const ownerType = route.ownerType || null;
    const assignedUserId = route.assignment?.user_id || ownerUser?.id || null;
    if (!ownerUser && !number) {
      // Unknown number: acknowledge to prevent retries
      return res.status(200).type('text/xml').send(twimlResponse('Thanks. We could not route your message.'));
    }

    // Find client by contact phone (best-effort)
    const client = route.client || (await Client.findByContactPhone(from));
    const agencyId = route.agencyId || (ownerUser ? await getAgencyIdForUser(ownerUser.id) : null);
    const clientId = client?.id || null;

    const keyword = parseInboundKeyword(body);
    if (numberId && clientId && keyword === 'STOP') {
      await TwilioOptInState.upsert({
        agencyId,
        clientId,
        numberId,
        status: 'opted_out',
        source: 'client_stop'
      });
    } else if (numberId && clientId && keyword === 'START') {
      await TwilioOptInState.upsert({
        agencyId,
        clientId,
        numberId,
        status: 'opted_in',
        source: 'client_start'
      });
    } else if (numberId && clientId) {
      await TwilioOptInState.upsert({
        agencyId,
        clientId,
        numberId,
        status: 'opted_in',
        source: 'inbound_message'
      });
    }

    // Log inbound message
    const inboundLog = await MessageLog.createInbound({
      agencyId,
      userId: ownerUser?.id || assignedUserId,
      assignedUserId,
      numberId,
      ownerType,
      clientId,
      body,
      fromNumber: from,
      toNumber: to,
      twilioMessageSid: messageSid,
      metadata: { provider: 'twilio', numberId }
    });

    const prefs = ownerUser ? await UserPreferences.findByUserId(ownerUser.id) : null;
    // Provider-level immediate support mirror option.
    if (agencyId && ownerUser?.id) {
      const agency = await Agency.findById(agencyId);
      const flags = parseFeatureFlags(agency?.feature_flags);
      const mirrorEnabled = prefs?.sms_support_mirror_enabled === true || prefs?.sms_support_mirror_enabled === 1;
      const supportPhone = MessageLog.normalizePhone(flags.smsSupportFallbackPhone || agency?.phone_number) ||
        flags.smsSupportFallbackPhone || agency?.phone_number || null;
      if (mirrorEnabled && supportPhone && clientId && (number?.phone_number || ownerUser?.system_phone_number)) {
        try {
          const supportBody = `Support mirror: inbound text from ${client?.initials || `client #${clientId || 'unknown'}`}. Message: "${String(body || '').slice(0, 180)}"`;
          await TwilioService.sendSms({
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
          console.warn('Support mirror SMS failed:', e.message);
        }
      }
    }

    if (keyword === 'STOP' && numberId && clientId) {
      const msg = await getRuleMessage(numberId, 'opt_out', 'You have been opted out. Reply START to rejoin.');
      return res.status(200).type('text/xml').send(twimlResponse(msg));
    }
    if (keyword === 'START' && numberId && clientId) {
      const msg = await getRuleMessage(numberId, 'opt_in', 'You are opted in. Reply STOP to unsubscribe.');
      return res.status(200).type('text/xml').send(twimlResponse(msg));
    }
    if (keyword === 'HELP' && numberId) {
      const msg = await getRuleMessage(numberId, 'help', 'Reply STOP to opt out. Reply START to opt in.');
      return res.status(200).type('text/xml').send(twimlResponse(msg));
    }

    if (numberId && !keyword) {
      const forwardRule = await TwilioNumberRule.getActiveRule(numberId, 'forward_inbound');
      if (forwardRule && (forwardRule.forward_to_user_id || forwardRule.forward_to_phone)) {
        const forwardBody = buildForwardBody(forwardRule.auto_reply_text, { body, from });
        try {
          if (forwardRule.forward_to_user_id) {
            await forwardInboundToUser({ number, body: forwardBody, from, userId: forwardRule.forward_to_user_id });
          }
          if (forwardRule.forward_to_phone) {
            await forwardInboundToPhone({ number, body: forwardBody, from, phone: forwardRule.forward_to_phone });
          }
        } catch (e) {
          console.warn('Inbound forward failed:', e.message);
        }
      }
    }

    // Safety net notifications (in-app only for support staff)
    if (agencyId && ownerUser?.id) {
      // Primary clinician gets notification too (in-app)
      await createNotificationAndDispatch(
        {
        type: 'inbound_client_message',
        severity: 'urgent',
        title: 'New inbound client message',
        message: client?.initials
          ? `New message from client ${client.initials}.`
          : 'New inbound message received.',
        userId: ownerUser.id,
        agencyId,
        relatedEntityType: 'message_log',
        relatedEntityId: inboundLog.id
        },
        { context: { isUrgent: true } }
      );

      const supportIds = await listSupportStaffIdsForAgency(agencyId);
      for (const supportUserId of supportIds) {
        await createNotificationAndDispatch(
          {
          type: 'support_safety_net_alert',
          severity: 'urgent',
          title: 'Safety Net: inbound client message',
          message: client?.initials
            ? `Inbound message from ${client.initials} (assigned clinician: ${ownerUser.first_name} ${ownerUser.last_name?.slice(0, 1) || ''}.)`
            : `Inbound message (assigned clinician: ${ownerUser.first_name} ${ownerUser.last_name?.slice(0, 1) || ''}.)`,
          userId: supportUserId,
          agencyId,
          relatedEntityType: 'message_log',
          relatedEntityId: inboundLog.id
          },
          { context: { isUrgent: true } }
        );
      }
    }

    // After-hours auto-responder (loop breaker: once per client every 4 hours)
    // Only when user has it enabled AND we are outside quiet hours (gatekeeper says SMS is suppressed).
    // Note: Auto reply sends to the client; this is independent of notification channel gating.
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
        const last = await MessageAutoReplyThrottle.getLastSentAt(ownerUser.id, from);
        const lastDate = last ? new Date(last) : null;
        const now = new Date();
        const hoursSince = lastDate ? (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60) : Infinity;

        if (hoursSince >= 4) {
          // Best effort send; if not configured, just skip sending but don't fail webhook.
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
                toNumber: from,
                deliveryStatus: 'pending',
                metadata: { autoReply: true, provider: 'twilio', numberId }
              });

              const msg = await TwilioService.sendSms({
                to: MessageLog.normalizePhone(from) || from,
                from: MessageLog.normalizePhone(number?.phone_number || ownerUser.system_phone_number) || number?.phone_number || ownerUser.system_phone_number,
                body: autoReplyMessage
              });

              await MessageLog.markSent(outboundLog.id, msg.sid, { autoReply: true, provider: 'twilio', status: msg.status });
              if (ownerUser?.id) {
                await MessageAutoReplyThrottle.upsertNow(ownerUser.id, from);
              }
            }
          } catch (sendErr) {
            // Don't block inbound processing.
            console.warn('Auto-reply send failed:', sendErr.message);
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
          const msg = await getRuleMessage(numberId, 'opt_out', 'You have been opted out. Reply START to rejoin.');
          return res.status(200).type('text/xml').send(twimlResponse(msg));
        }
      }
    }

    await forwardEmergency({ numberId, agencyId, body, fromNumber: from });

    // Twilio expects 200. We do NOT want to leak details.
    res.status(200).type('text/xml').send(twimlResponse('Thanks. Your message was received.'));
  } catch (e) {
    next(e);
  }
};

