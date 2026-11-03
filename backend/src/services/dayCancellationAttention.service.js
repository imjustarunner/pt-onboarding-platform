import pool from '../config/database.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

// The caller must first pass the email workspace's agency authorization. Only
// one's own provider or initiated cancellation plans can enter this projection.
export async function dayCancellationAttention(actor,agencyId,{database=pool,decrypt=maybeDecryptNotePayload}={}) {
  const [rows] = await database.execute(`SELECT token,provider_id,plan_json,results_json,updated_at FROM provider_day_cancellations
    WHERE (provider_id=? OR actor_user_id=?) AND status IN ('completed','partial')
    ORDER BY id DESC LIMIT 100`,[actor.id,actor.id]);
  const items = new Map();
  for (const row of rows) {
    const plan = JSON.parse(decrypt(typeof row.plan_json === 'string' ? row.plan_json : JSON.stringify(row.plan_json)));
    const results = typeof row.results_json === 'string' ? JSON.parse(row.results_json) : row.results_json || {};
    for (const item of plan.items || []) {
      if (Number(item.agencyId) !== Number(agencyId) || items.has(item.key)) continue;
      const result = results[item.key], delivery = result?.notificationDelivery;
      const needsAttention = result?.status === 'failed' || ['held','failed','skipped','suppressed'].some(k=>Number(delivery?.[k]) > 0);
      if (!needsAttention) continue;
      items.set(item.key,{id:`cancellation-${row.token}-${item.key}`,type:'cancellation_contact',subject:'Cancellation contact needs attention',
        deliveryLabel:item.title,updatedAt:row.updated_at,appointmentId:item.kind === 'appointment' ? item.id : null,
        last_message_preview:result.message || delivery.reason || 'Review the recorded recipients and unsent notices before contacting anyone again.',
        cancellationReview:{date:item.date || plan.date,providerId:Number(row.provider_id),agencyId:Number(agencyId)}});
    }
  }
  return [...items.values()];
}
