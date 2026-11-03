import { forwardClientSmsToProviders } from './providerSmsRelay.service.js';
import { sendConversationStartNotice } from './smsCommunicationNotice.service.js';
export { OUT_OF_OFFICE_SMS } from './smsCommunicationNotice.service.js';
import pool from '../config/database.js';
import MessageLog from '../models/MessageLog.model.js';
import SmsCareThread from '../models/SmsCareThread.model.js';
import VonageService from './vonage.service.js';
import { recordInboundConversation } from './smsCompliance.service.js';
import { recordSmsProfileAudit } from './smsProfileAudit.service.js';
import { alertRequestedSupport } from './smsRequestedSupport.service.js';
import { requestSmsSupportHandoff, markSmsSupportOfferAccepted } from './smsSupportHandoff.service.js';

export const SMS_CRISIS_NOTICE = 'This texting service is not for crises or emergencies. For suicide or emotional distress, call or text 988. For immediate danger or a medical emergency, call 911.';

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
    metadata: { directProviderCare: true, awaitingProviderReturn: true, ...(mediaUrls.length ? { media_urls: mediaUrls } : {}) } });
  await SmsCareThread.upsert({ agencyId, clientId, numberId, ownerUserId: userId,
    careState: 'under_care', supportAccess: 'observe', lastInboundAt: new Date() });
  await recordSmsProfileAudit({ agencyId, numberId, clientId, direction: 'INBOUND',
    numberPurpose: route.numberPurpose, fromNumber: from, toNumber: to, body,
    messageLogId: inbound.id });
  await forwardClientSmsToProviders({route,from,to,body,messageId,inboundLogId:inbound.id,mediaUrls});
  try {
    await sendConversationStartNotice({ agencyId, numberId, clientId, userId, from: to, to: from,
      inboundLogId: inbound.id, absenceKey: route.absenceKey });
  } catch (error) {
    // Preserve the original message even if the notice cannot be sent.
    console.warn('[smsOOO] Notice not sent:', error.code || 'sms_send_failed');
  }
}

export async function handleOutOfOfficeSupportReply({ agencyId, numberId, clientId, from, to, body, messageId }) {
  if (!agencyId || !numberId || !clientId) return false;
  const command=String(body||'').trim().toUpperCase();
  if(!['SUPPORT','YES','NO'].includes(command))return false;
  const db = await pool.getConnection();
  let offer, ticketId, originalId;
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
    // YES/NO applies only to this explicit disabled-texting offer. Y/N remain
    // appointment commands, so a reminder response can never forward a message.
    if(command!=='SUPPORT'&&!metadata.textingDisabled){await db.rollback();return false;}
    if(command==='NO'){await db.execute(`UPDATE message_logs SET metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.supportChoiceDeclinedAt',UTC_TIMESTAMP()) WHERE id=?`,[offer.id]);await db.commit();return true;}
    if (metadata.supportChoiceTicketId) {
      await db.rollback();
      // A later SUPPORT on an accepted offer is still a command, not a care
      // message or appointment response. Keep its existing durable ticket.
      return true;
    }
    originalId = Number(metadata.triggerInboundId);
    const handoff = await requestSmsSupportHandoff(db, { agencyId, numberId, clientId: offer.client_id,
      inboundLogId: originalId, requestedByUserId: null, reason: 'provider_absence', expectedFromNumber: from });
    ticketId = handoff.ticketId;
    await markSmsSupportOfferAccepted(db, offer.id, ticketId, messageId, originalId);
    await db.execute(`INSERT INTO message_logs
      (agency_id, number_id, user_id, assigned_user_id, client_id, direction, body, from_number, to_number, twilio_message_sid, delivery_status, metadata, sms_thread_key)
      VALUES (?, ?, ?, ?, ?, 'INBOUND', ?, ?, ?, ?, 'received', ?, ?)`, [agencyId, numberId, offer.user_id, offer.user_id, offer.client_id, body, from, to, messageId || null,
      JSON.stringify({ supportChoiceAccepted: true, supportTicketId: ticketId, offerId: offer.id }), offer.sms_thread_key]);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  // The persisted ticket is the retry source. An alert failure cannot lose the request.
  await alertRequestedSupport(originalId).catch(error => console.warn('[smsOOO] Support alert pending:', error.code || 'alert_failed'));
  await recordInboundConversation({ from, to, messageId });
  try {
    await sendLogged({ agencyId, numberId, clientId: offer.client_id, userId: offer.user_id, from: to, to: from,
      body: 'Your message is queued for urgent support review in Communication Hub. This does not confirm someone has read it. No appointment has been changed yet.',
      metadata: { supportChoiceConfirmation: true, supportTicketId: ticketId } });
  } catch (error) { console.warn('[smsOOO] Confirmation not sent:', error.code || 'sms_send_failed'); }
  return true;
}
