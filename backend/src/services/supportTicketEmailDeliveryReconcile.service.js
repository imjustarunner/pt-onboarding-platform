import { decryptTicketMessageRow } from '../utils/supportTicketCrypto.js';
import { hashReviewKey } from '../utils/supportReplyReview.shared.js';

const json = (value) => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };

export function confirmedSupportDelivery(receipt) {
  const metadata = json(receipt.communication_metadata);
  if (metadata.redirected || metadata.redirectedTo || metadata.redirected_to || metadata.testRedirect || metadata.test_redirect || metadata.testInboxRedirect) {
    return { status: 'failed', reason: 'test_redirect_not_delivered_to_school' };
  }
  const status = String(receipt.communication_status || '').toLowerCase();
  const canonicalProof = receipt.send_status === 'sent' ? receipt.gmail_message_id : null;
  if (!status && canonicalProof) return { status: 'sent', reason: null };
  if (['sent', 'delivered'].includes(status)) {
    return receipt.external_message_id || canonicalProof
      ? { status: 'sent', reason: null }
      : { status: null, reason: 'delivery_proof_missing' };
  }
  if (['failed', 'skipped', 'rejected'].includes(status)) return { status: 'failed', reason: `communication_${status}` };
  return { status: null, reason: 'delivery_pending' };
}

/** Reconcile recorded provider receipts only. This worker never sends or retries mail. */
export async function reconcileSupportTicketEmailDeliveries({ limit = 100 } = {}, dependencies = {}) {
  const database = dependencies.database || (await import('../config/database.js')).default;
  const review = dependencies.review || await import('./supportReplyReview.service.js');
  const syncInbox = dependencies.syncInbox || (async (ticketId, agencyId) => {
    const { syncEmailTicketsToInbox } = await import('./ticketEmailInboxAdapter.service.js');
    return syncEmailTicketsToInbox({ ticketId, agencyId, limit: 1, forceRefresh: true });
  });
  const take = Math.max(1, Math.min(500, Number(limit) || 100));
  const missingSentSnapshot = `(e.send_status = 'sent'
    AND (e.client_request_key IS NOT NULL OR e.communication_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM support_reply_review_snapshots r WHERE r.agency_id = e.agency_id
      AND r.ticket_message_id = e.ticket_message_id AND r.snapshot_kind = 'delivery' AND r.delivery_status = 'sent'))`;
  const [pending] = await database.execute(`SELECT e.id FROM support_ticket_email_messages e
    LEFT JOIN user_communications c ON c.id = e.communication_id AND c.agency_id = e.agency_id
    WHERE e.direction = 'outbound' AND (
      (e.send_status IN ('queued', 'sending') AND c.delivery_status IN ('sent', 'delivered', 'failed', 'skipped', 'rejected'))
      OR (${missingSentSnapshot} AND
        ((c.delivery_status IN ('sent', 'delivered') AND (c.external_message_id IS NOT NULL OR e.gmail_message_id IS NOT NULL))
          OR (c.id IS NULL AND e.gmail_message_id IS NOT NULL))))
    ORDER BY e.id LIMIT ${take}`);
  const outcomes = [];
  for (const pendingRow of pending) {
    const db = await database.getConnection();
    let row;
    try {
      await db.beginTransaction();
      const [rows] = await db.execute(`SELECT e.*, c.delivery_status AS communication_status,
          c.external_message_id, c.sent_at AS communication_sent_at, c.delivered_at AS communication_delivered_at,
          c.metadata AS communication_metadata, m.author_user_id, m.body, m.body_ciphertext, m.body_iv,
          m.body_auth_tag, m.encryption_key_id, d.source_message_id AS draft_source_message_id, d.thread_revision AS draft_thread_revision
        FROM support_ticket_email_messages e
        LEFT JOIN user_communications c ON c.id = e.communication_id AND c.agency_id = e.agency_id
        JOIN support_ticket_messages m ON m.id = e.ticket_message_id
        LEFT JOIN support_reply_review_snapshots d ON d.id = e.draft_snapshot_id AND d.agency_id = e.agency_id AND d.ticket_id = e.ticket_id
        WHERE e.id = ? AND (e.send_status IN ('queued', 'sending') OR ${missingSentSnapshot}) FOR UPDATE`, [pendingRow.id]);
      row = rows[0];
      if (!row) { await db.commit(); continue; }
      const decision = confirmedSupportDelivery(row);
      if (!decision.status) {
        await db.execute('UPDATE support_ticket_email_messages SET error_code = ? WHERE id = ?', [decision.reason, row.id]);
        await db.commit(); outcomes.push({ id: row.id, status: row.send_status, reason: decision.reason }); continue;
      }
      const message = decryptTicketMessageRow(row);
      if (message.body === '[Unable to decrypt]') throw Object.assign(new Error('Encrypted reply evidence is unavailable'), { code: 'support_review_source_unavailable' });
      const prior = await review.getDeliveryReviewEvidence({ agencyId: row.agency_id, ticketId: row.ticket_id, ticketMessageId: row.ticket_message_id });
      let sourceMessageId = row.draft_source_message_id || prior?.sourceMessageId || null;
      if (!sourceMessageId) {
        const [[source]] = await db.execute(`SELECT ticket_message_id AS id FROM support_ticket_email_messages
          WHERE ticket_id = ? AND direction = 'inbound' AND COALESCE(sent_at, created_at) <= ?
          ORDER BY COALESCE(sent_at, created_at) DESC, id DESC LIMIT 1`, [row.ticket_id, row.created_at]);
        sourceMessageId = source?.id || null;
      }
      const sentAt = row.communication_sent_at || row.communication_delivered_at || row.sent_at || null;
      const meta = json(row.communication_metadata);
      const actualInternetId = meta.internetMessageId || row.internet_message_id || null;
      const providerMessageId = row.external_message_id || (row.send_status === 'sent' ? row.gmail_message_id : null);
      // The receipt establishes sending, but missing timestamp is kept explicit.
      await review.captureSentReview({ agencyId: row.agency_id, ticketId: row.ticket_id,
        actorUserId: row.author_user_id, draftSnapshotId: row.draft_snapshot_id || null,
        ticketMessageId: row.ticket_message_id, sourceMessageId,
        threadRevision: row.draft_thread_revision || prior?.threadRevision || undefined,
        body: message.body, composedBody: prior?.composedBody ?? null, deliveryStatus: decision.status,
        transportMessageId: decision.status === 'sent' ? providerMessageId : null,
        internetMessageId: actualInternetId, communicationId: row.communication_id,
        occurredAt: sentAt || undefined, idempotencyKey: `ticket-email:${row.ticket_message_id}`,
        errorCode: decision.reason, sourceEvidence: [{ type: row.communication_id ? 'communication_delivery' : 'canonical_gmail_receipt',
          id: row.communication_id || row.id, timestampMissing: !sentAt }]
      });
      await db.execute(`UPDATE support_ticket_email_messages SET send_status = ?, gmail_message_id = ?,
        gmail_thread_id = COALESCE(?, gmail_thread_id), sent_at = ?, error_code = ?, error_message = NULL,
        internet_message_id = COALESCE(?, internet_message_id), internet_message_id_hash = COALESCE(?, internet_message_id_hash) WHERE id = ?`,
      [decision.status, decision.status === 'sent' ? providerMessageId : null, meta.threadId || null,
        decision.status === 'sent' ? sentAt : null, decision.reason, actualInternetId, actualInternetId ? hashReviewKey(actualInternetId) : null, row.id]);
      if (decision.status === 'sent') {
        await db.execute(`UPDATE support_tickets SET status = CASE WHEN status = 'closed' THEN status
            WHEN EXISTS (SELECT 1 FROM support_ticket_email_messages n WHERE n.ticket_id = support_tickets.id
              AND n.direction = 'inbound' AND n.ticket_message_id > ?) THEN status ELSE 'answered' END,
          answer = ?, answer_ciphertext = ?, answer_iv = ?, answer_auth_tag = ?, answer_encryption_key_id = ?,
          answered_by_user_id = ?, answered_at = COALESCE(?, answered_at), sent_at = COALESCE(?, sent_at),
          source_email_thread_id = COALESCE(?, source_email_thread_id),
          ai_draft_review_state = CASE WHEN EXISTS (SELECT 1 FROM support_ticket_email_messages n
            WHERE n.ticket_id = support_tickets.id AND n.direction = 'inbound' AND n.ticket_message_id > ?)
            THEN ai_draft_review_state ELSE 'sent' END
          WHERE id = ? AND agency_id = ?`, [row.ticket_message_id, row.body, row.body_ciphertext, row.body_iv,
          row.body_auth_tag, row.encryption_key_id, row.author_user_id, sentAt, sentAt, meta.threadId || null,
          row.ticket_message_id, row.ticket_id, row.agency_id]);
      }
      await db.commit(); outcomes.push({ id: row.id, status: decision.status });
    } catch (error) {
      await db.rollback(); outcomes.push({ id: pendingRow.id, status: 'reconciliation_failed', reason: error.code || 'support_delivery_reconciliation_failed' });
    } finally { db.release(); }
    if (row) await syncInbox(row.ticket_id, row.agency_id).catch(() => {});
  }
  return outcomes;
}
