import pool from '../config/database.js';
import { managedGroupEnvelope } from './managedWorkspaceGroupAccess.service.js';
import { resolveRecipientDeliveryGate } from './hubRecipientDelivery.service.js';

const addresses = value => (Array.isArray(value) ? value : [value])
  .flatMap(v => String(v?.email || v || '').split(/[,;]/))
  .map(v => v.trim().toLowerCase()).filter(Boolean);
const envelopeValue = value => addresses(value).join(', ');

/** Plan on the server, before creating or claiming an outbound message. */
export async function planEmailDelivery({ agencyId, userId, to, cc, bcc, choice = null, requireChoice = false, now = new Date() }) {
  if (choice != null && !['now', 'next_available'].includes(choice)) {
    throw Object.assign(new Error('Choose Send now or Send at next availability.'), { status: 400 });
  }
  // Expansion also enforces manager-only posting. Never expose the private roster in the warning.
  const expanded = await managedGroupEnvelope({
    to: envelopeValue(to), cc: envelopeValue(cc), bcc: envelopeValue(bcc), actorUserId: userId
  });
  const targets = [...new Set([...addresses(expanded.to), ...addresses(expanded.cc), ...addresses(expanded.bcc)])];
  const recipientIds = [];
  const holds = [];
  if (targets.length) {
    const placeholders = targets.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
       WHERE COALESCE(ua.is_active,1)=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
       AND (LOWER(TRIM(u.email)) IN (${placeholders}) OR LOWER(TRIM(u.work_email)) IN (${placeholders}))`,
      [agencyId, ...targets, ...targets]
    );
    recipientIds.push(...rows.map(r => Number(r.id)));
    if (choice !== 'now') {
      for (let i = 0; i < recipientIds.length; i += 8) {
        const gates = await Promise.all(recipientIds.slice(i, i + 8).map(id => resolveRecipientDeliveryGate({ agencyId, userId: id, now })));
        holds.push(...gates.filter(g => g?.receiveAt && new Date(g.receiveAt) > now));
      }
    }
  }
  // One group email has one dispatch time: wait until each next opening has been reached.
  const nextAvailableAt = holds.length
    ? new Date(Math.max(...holds.map(g => new Date(g.receiveAt).getTime()))).toISOString()
    : null;
  if (!choice && requireChoice && nextAvailableAt) {
    throw Object.assign(new Error('Choose when to send this email.'), {
      status: 409,
      code: 'RECIPIENT_AVAILABILITY_CHOICE_REQUIRED',
      availability: { recipientCount: holds.length, nextAvailableAt, timezone: holds[0].timezone }
    });
  }
  return {
    choice: choice || (requireChoice ? 'now' : null),
    recipientIds,
    scheduledAt: choice === 'next_available' ? nextAvailableAt : null
  };
}

export async function recordEmailDeliveryChoice(messageId, actorUserId, plan) {
  if (!plan?.choice) return;
  await pool.execute(
    `INSERT INTO communication_message_delivery_choices(message_id,actor_user_id,delivery_choice,recipient_user_ids,scheduled_at)
     VALUES(?,?,?,?,?)`,
    [messageId, actorUserId, plan.choice, JSON.stringify(plan.recipientIds), plan.scheduledAt ? new Date(plan.scheduledAt) : null]
  );
}

/** Only an actual sent app message for this owner can bypass an inbound hold.
 * Neither a client-provided delivery plan nor an arbitrary inbound header is trusted. */
export async function hasInboundDeliveryChoice({ agencyId, messageId, ownerUserId }) {
  if (!messageId || !ownerUserId) return false;
  const [rows] = await pool.execute(
    `SELECT d.recipient_user_ids FROM communication_messages inbound
     JOIN communication_messages outbound ON outbound.internet_message_id=inbound.internet_message_id
       AND outbound.direction='outbound' AND outbound.send_status='sent'
     JOIN communication_conversations c ON c.id=outbound.conversation_id AND c.agency_id=?
     JOIN communication_message_delivery_choices d ON d.message_id=outbound.id AND d.actor_user_id=outbound.author_user_id
     WHERE inbound.id=? AND inbound.direction='inbound' AND inbound.internet_message_id IS NOT NULL`,
    [agencyId, messageId]
  );
  return rows.some(row => {
    const ids = typeof row.recipient_user_ids === 'string' ? JSON.parse(row.recipient_user_ids) : row.recipient_user_ids;
    return Array.isArray(ids) && ids.map(Number).includes(Number(ownerUserId));
  });
}
