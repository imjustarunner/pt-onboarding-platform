import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import MessageLog from '../models/MessageLog.model.js';
import MessageAutoReplyThrottle from '../models/MessageAutoReplyThrottle.model.js';
import NotificationGatekeeperService from '../services/notificationGatekeeper.service.js';
import TwilioService from '../services/twilio.service.js';

function twimlResponse(message) {
  // Minimal TwiML response
  const safe = String(message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

async function getAgencyIdForUser(userId) {
  const agencies = await User.getAgencies(userId);
  return agencies?.[0]?.id || null;
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

    const ownerUser = await User.findBySystemPhoneNumber(to);
    if (!ownerUser) {
      // Unknown number: acknowledge to prevent retries
      return res.status(200).type('text/xml').send(twimlResponse('Thanks. We could not route your message.'));
    }

    // Find client by contact phone (best-effort)
    const client = await Client.findByContactPhone(from);
    const agencyId = client?.agency_id || (await getAgencyIdForUser(ownerUser.id));
    const clientId = client?.id || null;

    // Log inbound message
    const inboundLog = await MessageLog.createInbound({
      agencyId,
      userId: ownerUser.id,
      clientId,
      body,
      fromNumber: from,
      toNumber: to,
      twilioMessageSid: messageSid,
      metadata: { provider: 'twilio' }
    });

    // Safety net notifications (in-app only for support staff)
    if (agencyId) {
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
    const prefs = await UserPreferences.findByUserId(ownerUser.id);
    const autoReplyEnabled = prefs?.auto_reply_enabled === true || prefs?.auto_reply_enabled === 1;
    const smsEnabled = prefs?.sms_enabled === true || prefs?.sms_enabled === 1;
    const autoReplyMessage = prefs?.auto_reply_message || null;

    if (autoReplyEnabled && smsEnabled && autoReplyMessage) {
      const decision = await NotificationGatekeeperService.decideChannels({
        userId: ownerUser.id,
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
            if (ownerUser.system_phone_number) {
              const outboundLog = await MessageLog.createOutbound({
                agencyId,
                userId: ownerUser.id,
                clientId,
                body: autoReplyMessage,
                fromNumber: ownerUser.system_phone_number,
                toNumber: from,
                deliveryStatus: 'pending',
                metadata: { autoReply: true, provider: 'twilio' }
              });

              const msg = await TwilioService.sendSms({
                to: MessageLog.normalizePhone(from) || from,
                from: MessageLog.normalizePhone(ownerUser.system_phone_number) || ownerUser.system_phone_number,
                body: autoReplyMessage
              });

              await MessageLog.markSent(outboundLog.id, msg.sid, { autoReply: true, provider: 'twilio', status: msg.status });
              await MessageAutoReplyThrottle.upsertNow(ownerUser.id, from);
            }
          } catch (sendErr) {
            // Don't block inbound processing.
            console.warn('Auto-reply send failed:', sendErr.message);
          }
        }
      }
    }

    // Twilio expects 200. We do NOT want to leak details.
    res.status(200).type('text/xml').send(twimlResponse('Thanks. Your message was received.'));
  } catch (e) {
    next(e);
  }
};

