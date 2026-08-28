/**
 * Post-ingest hook for inbound email in the unified communications stack.
 * Classify sender trust → apply hold/unknown → OOO / SUPPORT / intent review.
 */
import pool from '../config/database.js';
import {
  classifyInboundSender,
  applySenderClassificationToConversation
} from './senderTrust.service.js';
import {
  maybeSendClientOooAutoReply,
  handleSupportKeywordReply,
  maybeCreateIntentReview
} from './emailAutomation.service.js';

function normEmail(v) {
  return String(v || '').trim().toLowerCase();
}

/**
 * Resolve personal-inbox owner for a conversation (owner_user_id or personal inbox).
 */
export async function resolveConversationOwnerUserId(conversationId) {
  const [rows] = await pool.execute(
    `SELECT c.owner_user_id, c.agency_id, c.inbox_id, i.kind, i.owner_user_id AS inbox_owner_user_id
     FROM communication_conversations c
     LEFT JOIN communication_inboxes i ON i.id = c.inbox_id
     WHERE c.id = ?
     LIMIT 1`,
    [conversationId]
  );
  const row = rows?.[0];
  if (!row) return null;
  if (row.owner_user_id) return Number(row.owner_user_id);
  if (String(row.kind || '') === 'personal' && row.inbox_owner_user_id) {
    return Number(row.inbox_owner_user_id);
  }
  return null;
}

/**
 * @param {object} opts
 * @param {number} opts.agencyId
 * @param {number} opts.conversationId
 * @param {number} [opts.messageId]
 * @param {string} opts.fromEmail
 * @param {string} [opts.subject]
 * @param {string} [opts.bodyText]
 * @param {number} [opts.ownerUserId] — override; else resolved from conversation/inbox
 */
export async function processInboundCommunicationEvent({
  agencyId,
  conversationId,
  messageId = null,
  fromEmail,
  subject = '',
  bodyText = '',
  ownerUserId = null
}) {
  const aid = Number(agencyId || 0);
  const cid = Number(conversationId || 0);
  if (!aid || !cid) return { ok: false, reason: 'missing_ids' };

  const email = normEmail(fromEmail);
  const ownerId = ownerUserId || (await resolveConversationOwnerUserId(cid));

  const classification = await classifyInboundSender({
    agencyId: aid,
    ownerUserId: ownerId,
    fromEmail: email
  });

  await applySenderClassificationToConversation(cid, classification);

  // Persist owner when personal inbox and not set
  if (ownerId) {
    await pool.execute(
      `UPDATE communication_conversations
       SET owner_user_id = COALESCE(owner_user_id, ?)
       WHERE id = ?`,
      [ownerId, cid]
    ).catch(() => {});
  }

  const results = { classification, ooo: null, support: null, intent: null };

  if (classification.trust === 'blocked') {
    return { ok: true, ...results, blocked: true };
  }

  // SUPPORT keyword (client replies to OOO)
  try {
    results.support = await handleSupportKeywordReply({
      agencyId: aid,
      conversationId: cid,
      ownerUserId: ownerId,
      fromEmail: email,
      bodyText
    });
  } catch (e) {
    console.warn('[inboundCommunication] SUPPORT handler failed:', e?.message || e);
  }

  // Client OOO outside availability
  if (['client', 'guardian'].includes(classification.trust)) {
    try {
      results.ooo = await maybeSendClientOooAutoReply({
        agencyId: aid,
        conversationId: cid,
        ownerUserId: ownerId,
        messageId,
        fromEmail: email,
        subject,
        bodyText
      });
    } catch (e) {
      console.warn('[inboundCommunication] OOO failed:', e?.message || e);
    }
  }

  // Cancellation/termination intent → review ticket (not auto-cancel)
  if (['client', 'guardian', 'contact'].includes(classification.trust)) {
    try {
      results.intent = await maybeCreateIntentReview({
        agencyId: aid,
        conversationId: cid,
        messageId,
        subject,
        bodyText,
        linkedClientId: classification.linkedClientId || null
      });
    } catch (e) {
      console.warn('[inboundCommunication] intent review failed:', e?.message || e);
    }
  }

  return { ok: true, ...results };
}

export default {
  processInboundCommunicationEvent,
  resolveConversationOwnerUserId
};
