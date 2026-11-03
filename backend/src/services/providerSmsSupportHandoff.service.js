import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { resolveRelayFamily, parseProviderReply } from './providerSmsRelayIdentity.service.js';
import { relayEnrollmentReady } from './providerSmsRelaySettings.service.js';
import { requestSmsSupportHandoff, markSmsSupportOfferAccepted } from './smsSupportHandoff.service.js';
import { alertRequestedSupport } from './smsRequestedSupport.service.js';

const metadataOf = row => typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};

// Exact message commands supplement the current short-code and confirmed
// conversation handoff. Bare SUPPORT remains in the recipient-confirmation flow.
export async function handleProviderSupportCommand({ enrollment, body, messageId }) {
  const text = String(body || '').trim();
  const parsed = parseProviderReply(text);
  const selector = parsed?.body.match(/^SUPPORT\s+#(\d+)$/i);
  if (!selector) {
    // A mistyped selector must never become a family reply. Ordinary SUPPORT
    // forms keep the current conversation confirmation or short-code flow.
    if (/^SUPPORT\s+\S/i.test(parsed?.body || text)) {
      return { status: 'guidance', body: 'Nothing has been forwarded. Reply SUPPORT to confirm a conversation, or use the exact family code and message number shown in the offer.' };
    }
    return null;
  }
  const code = parsed.code || null;
  const routeId = parsed.routeId || null;
  const originalId = Number(selector[1]);
  if (!Number.isSafeInteger(originalId) || originalId < 1 || (routeId !== null && (!Number.isSafeInteger(routeId) || routeId < 1))) {
    return { status: 'guidance', body: 'Nothing has been forwarded. Use the exact family code and message number shown in the offer.' };
  }
  const [offers] = await pool.execute(`SELECT * FROM message_logs WHERE agency_id=? AND number_id=?
    AND assigned_user_id=? AND to_number=? AND direction='OUTBOUND' AND delivery_status IN ('sent','delivered')
    AND created_at > DATE_SUB(NOW(), INTERVAL 48 HOUR)
    AND JSON_EXTRACT(metadata, '$.providerSchedulingSupportOffer') = true
    AND (? IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.replyCode'))=?)
    AND (? IS NULL OR JSON_EXTRACT(metadata, '$.relayRouteId')=?)
    AND JSON_EXTRACT(metadata, '$.originalInboundLogId')=?
    ORDER BY id DESC LIMIT 2`, [enrollment.agency_id, enrollment.number_id, enrollment.provider_user_id,
    enrollment.phone, code, code, routeId, routeId, originalId]);
  if (offers.length !== 1) return { status: 'guidance', body: offers.length
    ? 'More than one message can be forwarded. Reply with the exact family code and message number from the offer: CODE SUPPORT #123. Nothing has been forwarded.'
    : 'No matching scheduling handoff is available. Open the conversation in the app to contact Support. Nothing has been forwarded.' };
  const offer = offers[0];
  const metadata = metadataOf(offer);
  const client = await Client.findById(metadata.originalClientId, { includeSensitive: true });
  const [routes] = await pool.execute('SELECT * FROM provider_sms_relay_routes WHERE enrollment_id=? AND reply_code=?', [enrollment.id, metadata.replyCode]);
  const route = routes[0];
  const family = route && await resolveRelayFamily(client, route.family_phone);
  if (Number(client?.agency_id) !== Number(enrollment.agency_id) || Number(route?.client_id) !== Number(client?.id)
    || !family || Number(family.guardianUserId) !== Number(route.guardian_user_id)
    || !await relayEnrollmentReady(enrollment, client.id)) return { status: 'access_changed',
    body: 'Message not forwarded: the current recipient or provider assignment could not be verified. Review it in the app.' };
  const db = await pool.getConnection();
  let handoff;
  try {
    await db.beginTransaction();
    handoff = await requestSmsSupportHandoff(db, { agencyId: enrollment.agency_id, numberId: enrollment.number_id,
      clientId: client.id, inboundLogId: Number(metadata.originalInboundLogId), requestedByUserId: enrollment.provider_user_id,
      reason: 'scheduling_request', expectedFromNumber: family.phone });
    await markSmsSupportOfferAccepted(db, offer.id, handoff.ticketId, messageId, handoff.original.id);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  await alertRequestedSupport(handoff.original.id).catch(error => console.warn('[providerSMS] Support alert pending:', error.code || 'alert_failed'));
  return { status: 'support_forwarded', ticketId: handoff.ticketId,
    body: `${metadata.replyCode}: ${handoff.created ? 'Your message was forwarded' : 'This message has already been forwarded'} to Support in Communication Hub for scheduling help. No appointment has been changed yet.` };
}
