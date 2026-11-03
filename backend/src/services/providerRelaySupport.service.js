import pool from '../config/database.js';
import { alertRequestedSupport } from './smsRequestedSupport.service.js';
import { requestSmsSupportHandoff, markSmsSupportOfferAccepted } from './smsSupportHandoff.service.js';

// The caller holds the enrollment lock and rechecks the exact family and care
// assignment. All request paths lock the original family message, so providers
// and the family share its durable ticket and notification retry source.
export async function requestRelaySupport({ enrollment, route, inboundLogId }) {
  const db = await pool.getConnection();
  let handoff;
  try {
    await db.beginTransaction();
    const [messages] = await db.execute(`SELECT original.id FROM provider_sms_relay_dispatches d
      JOIN message_logs original ON original.id=d.inbound_log_id
      WHERE d.enrollment_id=? AND d.status='sent' AND original.agency_id=?
        AND original.number_id=? AND original.client_id=? AND original.from_number=?
        AND original.direction='INBOUND' ORDER BY d.id DESC LIMIT 1`,
    [enrollment.id,enrollment.agency_id,enrollment.number_id,route.client_id,route.family_phone]);
    if (!messages.length) throw Object.assign(new Error('Original family message is unavailable'), { code: 'handoff_message_unavailable' });
    handoff = await requestSmsSupportHandoff(db, { agencyId: enrollment.agency_id, numberId: enrollment.number_id,
      clientId: route.client_id, inboundLogId: messages[0].id, requestedByUserId: enrollment.provider_user_id,
      reason: 'provider_request', expectedFromNumber: route.family_phone });
    await markSmsSupportOfferAccepted(db, inboundLogId, handoff.ticketId, null, handoff.original.id);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  await alertRequestedSupport(handoff.original.id).catch(error => console.warn('[providerSMS] Support alert pending:',error.code || 'alert_failed'));
  return handoff.ticketId;
}
