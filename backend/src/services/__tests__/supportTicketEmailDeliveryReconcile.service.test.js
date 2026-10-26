import { it } from 'node:test';
import assert from 'node:assert/strict';
import { confirmedSupportDelivery, reconcileSupportTicketEmailDeliveries } from '../supportTicketEmailDeliveryReconcile.service.js';

function harness(overrides = {}) {
  const row = { id: 1, ticket_id: 10, agency_id: 2, ticket_message_id: 12, communication_id: 40,
    send_status: 'queued', communication_status: 'sent', external_message_id: 'gmail-proof',
    communication_sent_at: new Date('2026-10-26T17:00:00Z'), communication_metadata: JSON.stringify({ threadId: 'gmail-thread' }),
    body: 'Actual queued signed body', author_user_id: 559, draft_snapshot_id: 2,
    draft_source_message_id: '11', draft_thread_revision: '11', ...overrides };
  const state = { snapshots: [], ticketWrites: [], commits: 0, rollbacks: 0, synced: 0 };
  const db = {
    getConnection: async () => db, beginTransaction: async () => {}, commit: async () => { state.commits += 1; },
    rollback: async () => { state.rollbacks += 1; }, release: () => {},
    async execute(sql, params = []) {
      if (sql.startsWith('SELECT e.id FROM')) {
        state.selectionSql = sql;
        const missingSent = row.send_status === 'sent' && !state.snapshots.some((s) => s.deliveryStatus === 'sent');
        return [['queued', 'sending'].includes(row.send_status) || missingSent ? [{ id: 1 }] : []];
      }
      if (sql.startsWith('SELECT e.*, c.delivery_status')) return [[row]];
      if (sql.startsWith('SELECT ticket_message_id AS id')) return [[{ id: 11 }]];
      if (sql.startsWith('UPDATE support_ticket_email_messages SET error_code')) { row.error_code = params[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE support_ticket_email_messages SET send_status')) { row.send_status = params[0]; row.gmail_message_id = params[1]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE support_tickets SET status')) { state.ticketWrites.push({ sql, params }); return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL ${sql}`);
    }
  };
  const review = { getDeliveryReviewEvidence: async () => ({ composedBody: 'Original composed body', threadRevision: '11', sourceMessageId: '11' }), captureSentReview: async (input) => { state.snapshots.push(input); } };
  return { row, state, dependencies: { database: db, review, syncInbox: async () => { state.synced += 1; } } };
}

it('requires actual provider proof and rejects test redirects or pending approvals', () => {
  assert.deepEqual(confirmedSupportDelivery({ communication_status: 'sent' }), { status: null, reason: 'delivery_proof_missing' });
  assert.equal(confirmedSupportDelivery({ communication_status: 'delivered', external_message_id: 'gmail-id' }).status, 'sent');
  assert.equal(confirmedSupportDelivery({ communication_status: 'pending', external_message_id: 'reserved' }).status, null);
  assert.deepEqual(confirmedSupportDelivery({ communication_status: 'sent', external_message_id: 'test-gmail', communication_metadata: '{"redirected":true}' }), { status: 'failed', reason: 'test_redirect_not_delivered_to_school' });
  assert.deepEqual(confirmedSupportDelivery({ communication_status: 'sent', external_message_id: 'test-gmail', communication_metadata: '{"testInboxRedirect":true}' }), { status: 'failed', reason: 'test_redirect_not_delivered_to_school' });
  assert.equal(confirmedSupportDelivery({ send_status: 'sent', gmail_message_id: 'canonical-provider-proof' }).status, 'sent');
  assert.equal(confirmedSupportDelivery({ send_status: 'queued', gmail_message_id: 'reserved-unverified' }).status, null);
});

it('repairs an immediate sent reply whose final immutable snapshot failed, without resending', async () => {
  const h = harness({ send_status: 'sent', client_request_key: 'app-request', gmail_message_id: 'gmail-proof' });
  await reconcileSupportTicketEmailDeliveries({}, h.dependencies);
  await reconcileSupportTicketEmailDeliveries({}, h.dependencies);
  assert.equal(h.state.snapshots.length, 1);
  assert.equal(h.state.snapshots[0].body, 'Actual queued signed body');
  assert.equal(h.state.snapshots[0].composedBody, 'Original composed body');
  assert.equal(h.state.snapshots[0].draftSnapshotId, 2);
  assert.equal(h.state.snapshots[0].idempotencyKey, 'ticket-email:12');
  assert.match(h.state.selectionSql, /NOT EXISTS/);
  assert.match(h.state.selectionSql, /e\.client_request_key IS NOT NULL OR e\.communication_id IS NOT NULL/);
});

it('repairs an app send using its canonical Gmail receipt when communication logging was unavailable', async () => {
  const sentAt = new Date('2026-10-26T17:00:00Z');
  const h = harness({ send_status: 'sent', communication_id: null, communication_status: null,
    external_message_id: null, communication_sent_at: null, communication_metadata: null,
    client_request_key: 'app-request', gmail_message_id: 'canonical-provider-proof', sent_at: sentAt });
  const outcomes = await reconcileSupportTicketEmailDeliveries({}, h.dependencies);
  assert.equal(outcomes[0].status, 'sent');
  assert.equal(h.state.snapshots[0].transportMessageId, 'canonical-provider-proof');
  assert.equal(h.state.snapshots[0].occurredAt, sentAt);
  assert.equal(h.state.snapshots[0].sourceEvidence[0].type, 'canonical_gmail_receipt');
  assert.equal(h.row.gmail_message_id, 'canonical-provider-proof');
});

it('records actual final signed body and original composition after queued approval, once', async () => {
  const h = harness();
  assert.deepEqual(await reconcileSupportTicketEmailDeliveries({}, h.dependencies), [{ id: 1, status: 'sent' }]);
  await reconcileSupportTicketEmailDeliveries({}, h.dependencies);
  assert.equal(h.state.snapshots.length, 1);
  assert.equal(h.state.snapshots[0].body, 'Actual queued signed body');
  assert.equal(h.state.snapshots[0].composedBody, 'Original composed body');
  assert.equal(h.state.snapshots[0].draftSnapshotId, 2);
  assert.equal(h.state.snapshots[0].transportMessageId, 'gmail-proof');
  assert.equal(h.state.snapshots[0].sourceMessageId, '11');
  assert.equal(h.state.snapshots[0].threadRevision, '11');
  assert.equal(h.state.synced, 1);
  // Status SQL protects both intentional closure and a newer incoming message.
  const write = h.state.ticketWrites[0];
  assert.match(write.sql, /WHEN status = 'closed' THEN status/);
  assert.match(write.sql, /n\.direction = 'inbound' AND n\.ticket_message_id > \?/);
  assert.equal(write.params[0], 12);
});

it('does not change ticket answer or mark a send for rejection or test redirection', async () => {
  for (const override of [{ communication_status: 'rejected', external_message_id: null }, { communication_metadata: { redirected: true } }]) {
    const h = harness(override);
    await reconcileSupportTicketEmailDeliveries({}, h.dependencies);
    assert.equal(h.row.send_status, 'failed');
    assert.equal(h.state.ticketWrites.length, 0);
    assert.equal(h.state.snapshots[0].deliveryStatus, 'failed');
    assert.equal(h.state.snapshots[0].transportMessageId, null);
  }
});

it('keeps queued state visible when a communication says sent but has no provider receipt', async () => {
  const h = harness({ external_message_id: null });
  const results = await reconcileSupportTicketEmailDeliveries({}, h.dependencies);
  assert.equal(results[0].reason, 'delivery_proof_missing');
  assert.equal(h.row.send_status, 'queued');
  assert.equal(h.state.snapshots.length, 0);
  assert.equal(h.state.ticketWrites.length, 0);
});

it('does not finalize delivery metadata when immutable receipt capture fails, so the worker can retry safely', async () => {
  const h = harness();
  h.dependencies.review.captureSentReview = async () => { throw Object.assign(new Error('snapshot storage unavailable'), { code: 'snapshot_unavailable' }); };
  const results = await reconcileSupportTicketEmailDeliveries({}, h.dependencies);
  assert.equal(results[0].status, 'reconciliation_failed');
  assert.equal(h.row.send_status, 'queued');
  assert.equal(h.state.rollbacks, 1);
  assert.equal(h.state.ticketWrites.length, 0);
});
