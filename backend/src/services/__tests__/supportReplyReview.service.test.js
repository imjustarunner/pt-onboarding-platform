import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSupportReplyReviewService } from '../supportReplyReview.service.js';

let originalKey;
before(() => { originalKey = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64'); });
after(() => { if (originalKey === undefined) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = originalKey; });

function memoryDb() {
  const config = { agency_id: 2, reviewer_user_id: 507, pilot_user_ids_json: '[559,555]', time_zone: 'America/Denver', send_time: '18:00', weekdays_only: 1, is_enabled: 1, created_at: new Date('2026-10-26T12:00:00Z') };
  const ticket = { id: 10, agency_id: 2, claimed_by_user_id: 559, source_channel: 'email', question: 'Original school email', subject: 'Schedule', source_email_received_at: new Date('2026-10-26T15:00:00Z') };
  const state = { config, ticket, revision: 11, snapshots: [], digests: [], notifications: [], mail: [], sentCommunications: new Set(), queries: [], denyMember: false };
  return { state, async execute(sql, params = []) {
    state.queries.push({ sql, params });
    if (sql.startsWith('SELECT * FROM support_reply_pilot_config')) return [[config]];
    if (sql.startsWith('SELECT agency_id FROM user_agencies')) return [state.denyMember ? [] : [{ agency_id: 2 }]];
    if (sql.startsWith('SELECT * FROM support_tickets')) return [Number(params[0]) === 10 && Number(params[1]) === 2 ? [ticket] : []];
    if (sql.includes('MAX(id), 0) AS revision')) return [[{ revision: state.revision }]];
    if (sql.startsWith('SELECT m.*, e.internet_message_id')) return [[{ id: 11, body: 'Latest received email', received_at: new Date('2026-10-26T16:00:00Z'), internet_message_id: '<school-incoming@school>' }]];
    if (sql.startsWith('SELECT * FROM support_reply_review_snapshots')) {
      let rows = state.snapshots;
      if (sql.includes('request_key = ?')) rows = rows.filter((s) => s.agency_id === params[0] && s.request_key === params[1]);
      else if (sql.includes("WHERE id = ?")) rows = rows.filter((s) => s.id === params[0] && s.agency_id === params[1] && s.ticket_id === params[2] && s.snapshot_kind === 'draft');
      else if (sql.includes("snapshot_kind = 'draft'")) {
        rows = rows.filter((s) => s.snapshot_kind === 'draft' && s.ticket_id === params[0] && s.agency_id === params[1]);
        let index = 2;
        if (sql.includes('actor_user_id = ?')) { const actor = params[index++]; rows = rows.filter((s) => s.actor_user_id === actor || s.actor_user_id == null); }
        if (sql.includes('thread_revision = ?')) { const revision = params[index++]; rows = rows.filter((s) => s.thread_revision === revision); }
        if (sql.includes('source_message_id = ?')) { const source = params[index++]; rows = rows.filter((s) => s.source_message_id === source); }
        if (sql.includes('occurred_at <= ?')) { const cutoff = new Date(`${params[index++].replace(' ', 'T')}Z`); rows = rows.filter((s) => s.occurred_at <= cutoff); }
        rows = rows.slice().reverse();
      }
      return [sql.includes('LIMIT 1') && !sql.includes('LIMIT 15001') ? rows.slice(0, 1) : rows];
    }
    if (sql.startsWith('INSERT INTO support_reply_review_snapshots')) {
      const keys = ['agency_id', 'ticket_id', 'snapshot_kind', 'actor_user_id', 'draft_snapshot_id', 'ticket_message_id', 'source_message_id', 'thread_revision', 'delivery_status', 'transport_message_id', 'communication_id', 'model_name', 'provider_name', 'error_code', 'request_key', 'payload_encrypted', 'occurred_at'];
      const row = Object.fromEntries(keys.map((key, index) => [key, params[index]]));
      row.occurred_at = new Date(`${row.occurred_at.replace(' ', 'T')}Z`);
      const existing = state.snapshots.find((s) => s.agency_id === row.agency_id && s.request_key === row.request_key);
      if (!existing) state.snapshots.push({ id: state.snapshots.length + 1, ...row });
      return [{ insertId: existing?.id || state.snapshots.length, affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT t.*, u.first_name')) return [[ticket]];
    if (sql.startsWith('SELECT e.*, m.body')) return [state.mail];
    if (sql.startsWith('SELECT id FROM user_communications')) return [state.sentCommunications.has(params[0]) ? [{ id: params[0] }] : []];
    if (sql.startsWith('INSERT INTO support_reply_review_digests')) {
      let digest = state.digests.find((d) => d.agency_id === params[0] && d.local_date === params[2]);
      if (!digest) { digest = { id: state.digests.length + 1, agency_id: params[0], reviewer_user_id: params[1], local_date: params[2], status: 'pending', attempted_at: null }; state.digests.push(digest); }
      return [{ insertId: digest.id }];
    }
    if (sql.startsWith('SELECT * FROM support_reply_review_digests')) return [state.digests.filter((d) => d.agency_id === params[0] && d.local_date === params[1])];
    if (sql.startsWith("UPDATE support_reply_review_digests SET status = 'building'")) {
      const digest = state.digests.find((d) => d.id === params[2] && ['pending', 'failed'].includes(d.status) && !d.attempted_at);
      if (digest) Object.assign(digest, { status: 'building', claimed_at: params[0], claim_token: params[1] });
      return [{ affectedRows: digest ? 1 : 0 }];
    }
    if (sql.startsWith('SELECT u.id, u.email')) return [[{ id: 507, email: 'reviewer@example.test' }]];
    if (sql.startsWith('SELECT slug FROM agencies')) return [[{ slug: 'itsco' }]];
    if (sql.startsWith('SELECT id FROM notifications')) return [state.notifications.filter((n) => n.digestId === params[2])];
    if (sql.startsWith('INSERT INTO notifications')) { state.notifications.push({ id: state.notifications.length + 1, digestId: params[4], text: params[1] }); return [{ insertId: state.notifications.length }]; }
    if (sql.startsWith('UPDATE support_reply_review_digests SET counts_json')) {
      const digest = state.digests.find((d) => d.id === params[2] && d.status === 'building' && d.claim_token === params[3]);
      if (digest) Object.assign(digest, { counts_json: params[0], status: 'sending', attempted_at: params[1] });
      return [{ affectedRows: digest ? 1 : 0 }];
    }
    if (sql.startsWith('UPDATE support_reply_review_digests SET notification_id')) { const d = state.digests.find((d) => d.id === params[1]); d.notification_id = params[0]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE support_reply_review_digests SET status = ?')) {
      const idIndex = sql.includes('communication_id = ?') ? 5 : 3;
      const digest = state.digests.find((d) => d.id === params[idIndex] && d.claim_token === params[idIndex + 1]);
      if (digest) Object.assign(digest, { status: params[0], error_code: sql.includes('communication_id = ?') ? params[3] : params[1] });
      return [{ affectedRows: digest ? 1 : 0 }];
    }
    if (sql.startsWith("UPDATE support_reply_review_digests SET status = 'pending'") || sql.startsWith("UPDATE support_reply_review_digests SET status = 'unknown'") || sql.startsWith('UPDATE support_reply_review_digests d JOIN')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT local_date FROM support_reply_review_digests')) {
      const rows = state.digests.filter((d) => d.agency_id === params[0]);
      return [sql.includes('status IN') ? rows.filter((d) => ['pending', 'failed'].includes(d.status) && !d.attempted_at) : rows.slice().sort((a, b) => b.local_date.localeCompare(a.local_date)).slice(0, 1)];
    }
    throw new Error(`Unexpected test SQL: ${sql}`);
  } };
}

const input = { agencyId: 2, ticketId: 10, actorUserId: 559, threadRevision: '11' };

describe('immutable support reply review', () => {
  it('encrypts original/draft evidence and never overwrites a revision on idempotent retry', async () => {
    const db = memoryDb();
    const service = createSupportReplyReviewService({ db });
    const first = await service.recordDraftSnapshot({ ...input, body: 'Generated response', requestKey: 'request-1', model: 'test-model', sourceEvidence: [{ id: 11 }] });
    const retry = await service.recordDraftSnapshot({ ...input, body: 'A replacement must not overwrite', requestKey: 'request-1' });
    assert.equal(first.id, retry.id);
    assert.equal(retry.body, 'Generated response');
    assert.equal(first.originalReceived.body, 'Latest received email');
    assert.equal(first.sourceMessageId, '11');
    assert.equal(first.generatedOnly, true);
    assert.equal(db.state.snapshots.length, 1);
    assert.doesNotMatch(db.state.snapshots[0].payload_encrypted, /Generated response|Latest received email/);
  });

  it('fails closed when encryption is unavailable', async () => {
    const db = memoryDb();
    const service = createSupportReplyReviewService({ db, encrypt: () => { throw new Error('missing key'); } });
    await assert.rejects(service.recordDraftSnapshot({ ...input, body: 'private response' }), { status: 503 });
    assert.equal(db.state.snapshots.length, 0);
  });

  it('rejects stale generation and draft IDs belonging to another ticket', async () => {
    const db = memoryDb();
    const service = createSupportReplyReviewService({ db });
    const draft = await service.recordDraftSnapshot({ ...input, body: 'Draft' });
    db.state.revision = 12;
    await assert.rejects(service.recordDraftSnapshot({ ...input, body: 'Stale draft' }), { status: 409 });
    await assert.rejects(service.resolveDraftSnapshotForSend({ ...input, ticketId: 99, draftSnapshotId: draft.id }), { status: 409 });
    await assert.rejects(service.resolveDraftSnapshotForSend({ ...input, threadRevision: '12', draftSnapshotId: draft.id }), { status: 409 });
  });

  it('preserves queued and sent separately, uses the original draft, and collapses state transitions in a daily comparison', async () => {
    const db = memoryDb();
    const service = createSupportReplyReviewService({ db, now: () => new Date('2026-10-26T17:00:00Z') });
    const draft = await service.recordDraftSnapshot({ ...input, body: 'Draft version' });
    const send = { ...input, draftSnapshotId: draft.id, ticketMessageId: 12, composedBody: 'Edited reply', body: 'Edited and signed actual reply', idempotencyKey: 'send-12' };
    await service.captureSentReview({ ...send, deliveryStatus: 'queued' });
    await assert.rejects(service.captureSentReview({ ...send, deliveryStatus: 'sent' }), { status: 409 });
    const sent = await service.captureSentReview({ ...send, deliveryStatus: 'sent', transportMessageId: 'gmail-proof' });
    const repeat = await service.captureSentReview({ ...send, deliveryStatus: 'sent', transportMessageId: 'gmail-proof' });
    assert.equal(repeat.id, sent.id);
    assert.equal(db.state.snapshots.length, 3);
    const review = await service.dailyReview({ agencyId: 2, date: '2026-10-26' });
    assert.equal(review.totals.sent, 1);
    assert.equal(review.totals.queued, 0);
    assert.equal(review.rows[0].comparison.generatedDraft, 'Draft version');
    assert.equal(review.rows[0].comparison.sentBody, 'Edited and signed actual reply');
    assert.equal(review.rows[0].comparison.edited, true);
    assert.equal(review.coverage.completeMailboxCoverage, false);
  });

  it('records externally observed replies on closed tickets without claiming a nonexistent draft', async () => {
    const db = memoryDb(); db.state.ticket.status = 'closed';
    const service = createSupportReplyReviewService({ db });
    const result = await service.captureExternalReplyReview({ ...input, body: 'Actually emailed from Gmail', ticketMessageId: 12, transportMessageId: 'observed-gmail', occurredAt: '2026-10-26T17:00:00Z' });
    assert.equal(result.status, 'sent'); assert.equal(result.missingDraft, true);
    assert.equal(result.external, true); assert.equal(result.draftSnapshotId, null);
    assert.equal(db.state.ticket.status, 'closed');
    const review = await service.dailyReview({ agencyId: 2, date: '2026-10-26' });
    assert.equal(review.totals.externalReplies, 1); assert.equal(review.totals.missingDraft, 1);
    assert.equal(review.rows[0].comparison.generatedDraft, null);
  });

  it('never pairs an earlier Gmail reply with a draft generated later', async () => {
    const db = memoryDb();
    const service = createSupportReplyReviewService({ db, now: () => new Date('2026-10-26T18:00:00Z') });
    const draft = await service.recordDraftSnapshot({ ...input, body: 'Future draft' });
    const external = await service.captureExternalReplyReview({ ...input, body: 'Earlier real reply', transportMessageId: 'earlier-gmail', occurredAt: '2026-10-26T17:00:00Z' });
    assert.equal(external.draftSnapshotId, null);
    assert.equal(external.missingDraft, true);
    await assert.rejects(service.resolveDraftSnapshotForSend({ ...input, draftSnapshotId: draft.id, occurredAt: '2026-10-26T17:00:00Z' }), { code: 'support_review_future_draft' });
  });

  it('compares an external reply without a draft with its original email, not a later incoming message', async () => {
    const db = memoryDb();
    const service = createSupportReplyReviewService({ db });
    await service.captureExternalReplyReview({ ...input, sourceMessageId: 11, body: 'Answer to the first email',
      ticketMessageId: 12, transportMessageId: 'gmail-reply', occurredAt: '2026-10-26T17:00:00Z' });
    db.state.mail.push({ id: 3, ticket_id: 10, ticket_message_id: 13, direction: 'inbound',
      body: 'A different question received after the reply', sent_at: '2026-10-26T18:00:00Z' });
    const review = await service.dailyReview({ agencyId: 2, date: '2026-10-26' });
    assert.equal(review.rows[0].originalReceived.body, 'Latest received email');
    assert.equal(review.rows[0].originalReceived.sourceMessageId, 11);
    assert.equal(review.rows[0].comparison.sentBody, 'Answer to the first email');
    assert.equal(review.rows[0].comparison.missingDraft, true);
  });

  it('uses the incoming email before a legacy delivery when its immutable snapshot is missing', async () => {
    const db = memoryDb();
    db.state.mail.push(
      { id: 1, ticket_id: 10, ticket_message_id: 11, direction: 'inbound', body: 'The question that was answered', sent_at: '2026-10-26T16:00:00Z' },
      { id: 2, ticket_id: 10, ticket_message_id: 12, direction: 'outbound', body: 'The actual reply', send_status: 'sent', gmail_message_id: 'gmail-legacy', sent_at: '2026-10-26T17:00:00Z' },
      { id: 3, ticket_id: 10, ticket_message_id: 13, direction: 'inbound', body: 'An unrelated later request', sent_at: '2026-10-26T18:00:00Z' }
    );
    const service = createSupportReplyReviewService({ db });
    const review = await service.dailyReview({ agencyId: 2, date: '2026-10-26' });
    assert.equal(review.rows[0].originalReceived.body, 'The question that was answered');
    assert.equal(review.rows[0].originalReceived.sourceMessageId, 11);
    assert.equal(review.rows[0].comparison.sentBody, 'The actual reply');
    assert.ok(review.rows[0].coverageFlags.includes('delivery_snapshot_missing'));
  });

  it('does not count a deterministic signature as an edit to an accepted draft', async () => {
    const db = memoryDb();
    const service = createSupportReplyReviewService({ db, now: () => new Date('2026-10-26T17:00:00Z') });
    const draft = await service.recordDraftSnapshot({ ...input, body: 'Unchanged draft' });
    await service.captureSentReview({ ...input, draftSnapshotId: draft.id, ticketMessageId: 12, composedBody: 'Unchanged draft', body: 'Unchanged draft\n\nVerified staff signature', deliveryStatus: 'sent', transportMessageId: 'signed-gmail' });
    const review = await service.dailyReview({ agencyId: 2, date: '2026-10-26' });
    assert.equal(review.rows[0].comparison.edited, false);
    assert.equal(review.rows[0].comparison.sentBody, 'Unchanged draft\n\nVerified staff signature');
  });

  it('checks actual membership even when an administrator supplies another agency ID', async () => {
    const db = memoryDb(); db.state.denyMember = true;
    const service = createSupportReplyReviewService({ db });
    await assert.rejects(service.authorize({ id: 507, role: 'admin' }, 2), { status: 403 });
  });

  it('durably sends one generic digest across two concurrent scheduler workers and retries', async () => {
    const db = memoryDb(); let sends = 0;
    const options = { db, now: () => new Date('2026-10-27T00:01:00Z'), sendNotice: async ({ notice }) => { sends += 1; assert.doesNotMatch(notice.text, /Latest received email|Original school email/); return { id: 'gmail-notice' }; } };
    const a = createSupportReplyReviewService(options), b = createSupportReplyReviewService(options);
    await Promise.all([a.runDigestTick(), b.runDigestTick()]);
    await a.runDigestTick();
    assert.equal(sends, 1); assert.equal(db.state.digests.length, 1); assert.equal(db.state.notifications.length, 1);
    assert.equal(db.state.digests[0].status, 'sent');
  });

  it('does not blindly resend a notice after an ambiguous transport failure', async () => {
    const db = memoryDb(); let sends = 0;
    const service = createSupportReplyReviewService({ db, now: () => new Date('2026-10-27T00:01:00Z'), sendNotice: async () => { sends += 1; throw new Error('timeout after submission'); } });
    await service.runDigestTick(); await service.runDigestTick();
    assert.equal(sends, 1); assert.equal(db.state.digests[0].status, 'unknown');
  });

  it('does not call queued or redirected delivery a notice sent to Rachel', async () => {
    for (const [result, expected] of [[{ queued: true, communicationId: 41 }, 'queued'], [{ id: 'test-inbox', redirected: true }, 'redirected'], [{}, 'unknown']]) {
      const db = memoryDb();
      const service = createSupportReplyReviewService({ db, now: () => new Date('2026-10-27T00:01:00Z'), sendNotice: async () => result });
      await service.runDigestTick(); assert.equal(db.state.digests[0].status, expected);
    }
  });
});
