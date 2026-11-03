import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { resolveRelayFamily } from './providerSmsRelayIdentity.service.js';
import { relayEnrollmentReady } from './providerSmsRelaySettings.service.js';
import { requestSmsSupportHandoff, markSmsSupportOfferAccepted } from './smsSupportHandoff.service.js';
import { alertRequestedSupport } from './smsRequestedSupport.service.js';

const metadataOf = row => typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};

// A bare SUPPORT is safe only when exactly one offered message is outstanding.
// Explicit codes/message IDs let providers choose among several families/messages.
export async function handleProviderSupportCommand({ enrollment, body, messageId }) {
  const command = String(body || '').trim().match(/^(?:([A-Z0-9-]+)\s+)?SUPPORT(?:\s+#(\d+))?$/i);
  if (!command) return null;
  const code = command[1]?.toUpperCase() || null;
  const originalId = command[2] ? Number(command[2]) : null;
  const [offers] = await pool.execute(`SELECT * FROM message_logs WHERE agency_id=? AND number_id=?
    AND assigned_user_id=? AND to_number=? AND direction='OUTBOUND' AND delivery_status IN ('sent','delivered')
    AND created_at > DATE_SUB(NOW(), INTERVAL 48 HOUR)
    AND JSON_EXTRACT(metadata, '$.providerSchedulingSupportOffer') = true
    AND (? IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.replyCode'))=?)
    AND (? IS NULL OR JSON_EXTRACT(metadata, '$.originalInboundLogId')=?)
    AND (? IS NOT NULL OR JSON_EXTRACT(metadata, '$.supportChoiceTicketId') IS NULL)
    ORDER BY id DESC LIMIT 2`, [enrollment.agency_id, enrollment.number_id, enrollment.provider_user_id,
    enrollment.phone, code, code, originalId, originalId, originalId]);
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
      reason: 'scheduling_request' });
    if (handoff.original.from_number !== family.phone) throw new Error('Original message recipient changed');
    await markSmsSupportOfferAccepted(db, offer.id, handoff.ticketId, messageId, handoff.original.id);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  await alertRequestedSupport(handoff.original.id).catch(error => console.warn('[providerSMS] Support alert pending:', error.code || 'alert_failed'));
  return { status: 'support_forwarded', ticketId: handoff.ticketId,
    body: `${metadata.replyCode}: ${handoff.created ? 'Your message was forwarded' : 'This message has already been forwarded'} to Support in Communication Hub for scheduling help. No appointment has been changed yet.` };
}
