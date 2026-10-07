import pool from '../config/database.js';
import MessageLog from '../models/MessageLog.model.js';
import SmsCareThread from '../models/SmsCareThread.model.js';
import VonageService from './vonage.service.js';
import { recordInboundConversation } from './smsCompliance.service.js';
import { recordSmsProfileAudit } from './smsProfileAudit.service.js';
import { alertRequestedSupport } from './smsRequestedSupport.service.js';

export const SMS_CRISIS_NOTICE = 'This texting service is not for crises or emergencies. For suicide or emotional distress, call or text 988. For immediate danger or a medical emergency, call 911.';
export const OUT_OF_OFFICE_SMS = `Your assigned provider(s) are unavailable and are not monitoring texts right now. Reply SUPPORT to request urgent support review. Otherwise, your message will wait in their inbox until they return. Support response times depend on staff availability. ${SMS_CRISIS_NOTICE}`;

async function sendLogged({ agencyId, numberId, clientId, userId, from, to, body, metadata }) {
  const log = await MessageLog.createOutbound({ agencyId, numberId, clientId, userId,
    fromNumber: from, toNumber: to, body, metadata });
  try {
    const sent = await VonageService.sendSms({ purpose: 'care', agencyId, from, to, body });
    await MessageLog.markSent(log.id, sent.sid, metadata);
  } catch (error) {
    await MessageLog.markFailed(log.id, error.code || 'sms_send_failed');
    throw error;
  }
}

export async function offerOutOfOfficeSupport({ route, from, to, body, messageId, mediaUrls = [] }) {
  const agencyId = route.agencyId, clientId = route.clientId, numberId = route.number.id;
  const userId = route.careOwnerUserId;
  // Carrier retries must not duplicate the message or the offer.
  if (messageId) {
    const [existing] = await pool.execute('SELECT id FROM message_logs WHERE agency_id = ? AND number_id = ? AND direction = \'INBOUND\' AND twilio_message_sid = ? LIMIT 1', [agencyId, numberId, messageId]);
    if (existing.length) return;
  }
  const inbound = await MessageLog.createInbound({ agencyId, numberId, clientId, userId,
    assignedUserId: userId, ownerType: 'staff', fromNumber: from, toNumber: to,
    providerMessageSid: messageId, body: body || '[Multimedia message]',
    metadata: { provider: 'vonage', awaitingProviderReturn: true, ...(mediaUrls.length ? { media_urls: mediaUrls } : {}) } });
  await SmsCareThread.upsert({ agencyId, clientId, numberId, ownerUserId: userId,
    careState: 'under_care', supportAccess: 'observe', lastInboundAt: new Date() });
  await recordSmsProfileAudit({ agencyId, numberId, clientId, direction: 'INBOUND',
    numberPurpose: route.numberPurpose, fromNumber: from, toNumber: to, body,
    messageLogId: inbound.id });
  const [recent] = await pool.execute(`SELECT id FROM message_logs WHERE agency_id = ? AND number_id = ?
    AND client_id = ? AND from_number = ? AND to_number = ? AND direction = 'OUTBOUND'
    AND delivery_status IN ('sent', 'delivered') AND created_at > DATE_SUB(NOW(), INTERVAL 4 HOUR)
    AND JSON_EXTRACT(metadata, '$.supportChoiceOffer') = true
    AND JSON_EXTRACT(metadata, '$.supportChoiceTicketId') IS NULL LIMIT 1`, [agencyId, numberId, clientId, to, from]);
  if (recent.length) return;
  try {
    await sendLogged({ agencyId, numberId, clientId, userId, from: to, to: from, body: OUT_OF_OFFICE_SMS,
      metadata: { provider: 'vonage', supportChoiceOffer: true, triggerInboundId: inbound.id } });
  } catch (error) {
    // Preserve the client's original message even if consent or carrier delivery blocks the offer.
    console.warn('[smsOOO] Offer not sent:', error.code || 'sms_send_failed');
  }
}

export async function handleOutOfOfficeSupportReply({ agencyId, numberId, clientId, from, to, body, messageId }) {
  if (!agencyId || !numberId || !clientId) return false;
  if (String(body || '').trim().toUpperCase() !== 'SUPPORT') return false;
  const db = await pool.getConnection();
  let offer, ticketId;
  try {
    await db.beginTransaction();
    const [offers] = await db.execute(`SELECT * FROM message_logs WHERE agency_id = ? AND number_id = ? AND client_id = ?
      AND from_number = ? AND to_number = ? AND direction = 'OUTBOUND' AND delivery_status IN ('sent', 'delivered')
      AND created_at > DATE_SUB(NOW(), INTERVAL 48 HOUR)
      AND JSON_EXTRACT(metadata, '$.supportChoiceOffer') = true ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [agencyId, numberId, clientId, to, from]);
    offer = offers[0];
    if (!offer) { await db.rollback(); return false; }
    const metadata = typeof offer.metadata === 'string' ? JSON.parse(offer.metadata) : offer.metadata || {};
    if (metadata.supportChoiceTicketId) {
      await db.rollback();
      return !!messageId && metadata.supportChoiceReplyId === messageId;
    }
    const [ticket] = await db.execute(`INSERT INTO support_tickets
      (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority, close_on_read)
      VALUES (?, ?, ?, ?, ?, ?, 'open', 'high', 0)`, [agencyId, offer.client_id, offer.user_id, agencyId,
      'Urgent: client requested support by text', `Client replied SUPPORT to the out-of-office offer. Claim this request, review message #${Number(metadata.triggerInboundId)} and the shared SMS conversation in the app, respond securely, and close the ticket when handled. Urgent support review is not crisis response.`]);
    ticketId = ticket.insertId;
    await db.execute(`UPDATE message_logs SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()),
      '$.supportChoiceTicketId', ?, '$.supportChoiceReplyId', ?, '$.supportChoiceAcceptedAt', UTC_TIMESTAMP()) WHERE id = ?`, [ticketId, messageId || null, offer.id]);
    await db.execute(`UPDATE sms_care_threads SET care_state = 'escalated', support_access = 'respond',
      support_ticket_id = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ? AND client_id = ? AND number_id = ?`, [ticketId, agencyId, offer.client_id, numberId]);
    await db.execute(`INSERT INTO message_logs
      (agency_id, number_id, user_id, assigned_user_id, client_id, direction, body, from_number, to_number, twilio_message_sid, delivery_status, metadata, sms_thread_key)
      VALUES (?, ?, ?, ?, ?, 'INBOUND', ?, ?, ?, ?, 'received', ?, ?)`, [agencyId, numberId, offer.user_id, offer.user_id, offer.client_id, body, from, to, messageId || null,
      JSON.stringify({ supportChoiceAccepted: true, supportTicketId: ticketId, offerId: offer.id }), offer.sms_thread_key]);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  // The persisted ticket is the retry source. An alert failure cannot lose the request.
  await alertRequestedSupport(offer.id).catch(error => console.warn('[smsOOO] Support alert pending:', error.code || 'alert_failed'));
  await recordInboundConversation({ from, to, messageId });
  try {
    await sendLogged({ agencyId, numberId, clientId: offer.client_id, userId: offer.user_id, from: to, to: from,
      body: `Your request is queued for urgent support review. Response times depend on staff availability; this does not confirm someone has read it. ${SMS_CRISIS_NOTICE}`,
      metadata: { supportChoiceConfirmation: true, supportTicketId: ticketId } });
  } catch (error) { console.warn('[smsOOO] Confirmation not sent:', error.code || 'sms_send_failed'); }
  return true;
}
