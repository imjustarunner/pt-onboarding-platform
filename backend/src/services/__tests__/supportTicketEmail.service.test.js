import test from 'node:test';
import assert from 'node:assert/strict';
import { sendSupportTicketEmailReply } from '../supportTicketEmail.service.js';
import { chooseCanonicalSupportTicket, classifyTicketHistoryMessage, isManagedSupportIdentity, supportReplyHeaders } from '../supportTicketEmailPolicy.js';
import { decryptTicketMessageRow } from '../../utils/supportTicketCrypto.js';
import pool from '../../config/database.js';
test.after(() => pool.end());

function harness({ claimedBy = 5, revision = 10, result = { id: 'gmail-sent', internetMessageId: '<sent@agency.test>', bodyText: 'Hello\n\nHannah · Agency' }, failure = null } = {}) {
  const statements = [], captures = [], sends = [];
  let delivery = null;
  const db = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async execute(sql, values = []) {
    statements.push({ sql, values });
    assert.equal((sql.match(/\?/g) || []).length, values.length, `SQL binds: ${sql}`);
    if (sql.startsWith('SELECT * FROM support_tickets')) return [[{ id: 1, agency_id: 2, school_organization_id: 7,
      source_channel: 'email', source_email_from: 'school@example.test', source_email_subject: 'Forms',
      source_email_message_id: '<inbound@school.test>', source_email_thread_id: 'gmail-thread', claimed_by_user_id: claimedBy }]];
    if (sql.includes('SELECT u.id,u.role')) return [[{ id: 5, role: 'support' }]];
    if (sql.startsWith('SELECT t.id,t.claimed_by_user_id')) return [[{ id: 1 }]];
    if (sql.startsWith('INSERT INTO support_ticket_email_thread_sync')) return [{ affectedRows: 1 }];
    if (sql.includes('client_request_key=?')) return [delivery ? [delivery] : []];
    if (sql.startsWith('SELECT MAX(id)')) return [[{ id: revision }]];
    if (sql.includes('SELECT m.id FROM support_ticket_messages')) return [[{ id: 10 }]];
    if (sql.includes('FROM email_sender_identities')) return [[{ id: 22, agency_id: 2, is_active: 1,
      identity_key: 'schools', from_email: 'schools@agency.test', display_name: 'Agency Schools' },
    { id: 99, agency_id: 2, is_active: 1, identity_key: 'personal_5', from_email: 'hannah@agency.test' }]];
    if (sql.startsWith('SELECT itsco_email')) return [[{ itsco_email: 'school-group@agency.test' }]];
    if (sql.includes('u.first_name,u.last_name')) return [[{ id: 5, first_name: 'Hannah', last_name: 'Human', agency_name: 'Agency' }]];
    if (sql.startsWith('SELECT * FROM support_ticket_email_messages')) return [[]];
    if (sql.startsWith('INSERT INTO support_ticket_messages')) return [{ insertId: 11 }];
    if (sql.startsWith('INSERT INTO support_ticket_email_messages')) {
      delivery = { id: 44, ticket_message_id: 11, send_status: 'sending', from_email: values[4], from_name: values[5] };
      return [{ insertId: 44 }];
    }
    if (sql.startsWith('UPDATE support_ticket_email_messages SET send_status')) { delivery.send_status = values[0]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE support_ticket_email_messages SET error_code')) { delivery.error_code = values[0]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE support_tickets') || sql.startsWith('UPDATE support_ticket_messages')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL ${sql}`);
  } };
  const database = { getConnection: async () => db, execute: (...args) => db.execute(...args) };
  const review = { resolveDraftSnapshotForSend: async () => ({ id: 6 }), captureSentReview: async (input) => captures.push(input) };
  return { statements, captures, sends, review,
    dependencies: { database, review, syncInbox: async () => {}, sendEmail: async (input) => { sends.push(input); if (failure) throw failure; return result; } } };
}
const input = { ticketId: 1, actorUserId: 5, body: 'Hello', clientRequestId: 'browser-request-1', expectedLastMessageId: 10 };

test('sends one human reply using shared From/Reply-To, RFC headers, encrypted canonical signed body and immutable draft link', async () => {
  const oldKey = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
  try {
    const h = harness();
    const response = await sendSupportTicketEmailReply(input, h.dependencies);
    assert.equal(response.status, 'sent');
    assert.equal(h.sends[0].senderIdentityId, 22);
    assert.equal(h.sends[0].replyToOverride, 'schools@agency.test');
    assert.equal(h.sends[0].fromDisplayNameOverride, 'Hannah Human · Agency');
    assert.equal(h.sends[0].inReplyTo, '<inbound@school.test>');
    assert.equal(h.sends[0].references, '<inbound@school.test>');
    assert.equal(h.sends[0].threadId, 'gmail-thread');
    assert.equal(h.sends[0].to, 'school@example.test');
    const saved = h.statements.find((s) => s.sql.startsWith('INSERT INTO support_ticket_messages'));
    assert.equal(saved.values[4], null);
    assert.equal(decryptTicketMessageRow({ body: saved.values[4], body_ciphertext: saved.values[5], body_iv: saved.values[6], body_auth_tag: saved.values[7], encryption_key_id: saved.values[8] }).body, 'Hello');
    assert.equal(h.captures[0].deliveryStatus, 'sending');
    assert.equal(h.captures[0].composedBody, 'Hello');
    assert.equal(h.captures.at(-1).body, 'Hello\n\nHannah · Agency');
    assert.equal(h.captures.at(-1).composedBody, 'Hello');
    assert.equal(h.captures.at(-1).draftSnapshotId, 6);
    assert.equal(h.captures.at(-1).threadRevision, '10');
    const answer = h.statements.find((s) => s.sql.includes('answered_at=CURRENT_TIMESTAMP'));
    assert.match(answer.sql, /newer\.direction='inbound'.*newer\.ticket_message_id>/s);
    assert.match(answer.sql, /status=CASE WHEN status='closed' THEN status WHEN EXISTS/);
    const again = await sendSupportTicketEmailReply(input, h.dependencies);
    assert.equal(again.duplicate, true);
    assert.equal(h.sends.length, 1);
  } finally { if (oldKey == null) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = oldKey; }
});

for (const scenario of [
  { name: 'approval queue', result: { queued: true, pendingApproval: true, communicationId: 8, reason: 'requires_approval' }, expected: 'queued' },
  { name: 'blocked delivery', result: { skipped: true, reason: 'notifications_disabled' }, expected: 'failed' },
  { name: 'missing provider confirmation', result: {}, expected: 'failed' },
  { name: 'testing inbox redirect', result: { id: 'test-copy', redirected: true }, expected: 'failed' },
  { name: 'ambiguous provider timeout', failure: new Error('timeout'), expected: 'failed' }
]) test(`${scenario.name} never marks the ticket answered or resends an idempotent request`, async () => {
  const oldKey = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 3).toString('base64');
  try {
    const h = harness(scenario);
    const response = await sendSupportTicketEmailReply(input, h.dependencies);
    assert.equal(response.status, scenario.expected);
    assert.equal(h.statements.some((s) => s.sql.includes('answered_at=CURRENT_TIMESTAMP')), false);
    assert.equal(h.captures.at(-1).deliveryStatus, scenario.expected);
    await sendSupportTicketEmailReply(input, h.dependencies);
    assert.equal(h.sends.length, 1);
  } finally { if (oldKey == null) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = oldKey; }
});

test('review capture must persist the accepted composition before any provider send', async () => {
  const oldKey = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
  try {
    const h = harness();
    h.review.captureSentReview = async () => { throw new Error('snapshot unavailable'); };
    await assert.rejects(sendSupportTicketEmailReply(input, h.dependencies), { code: 'SUPPORT_EMAIL_REVIEW_UNAVAILABLE' });
    assert.equal(h.sends.length, 0);
    const receipt = await sendSupportTicketEmailReply(input, h.dependencies);
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.duplicate, true);
    assert.equal(h.sends.length, 0);
  } finally { if (oldKey == null) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = oldKey; }
});

test('sent review outage preserves sent status and original composition for repair without another transport call', async () => {
  const oldKey = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
  try {
    const h = harness({ result: { id: 'gmail-proof', communicationId: 40, bodyText: 'Hello\n\nHannah · Agency' } });
    h.review.captureSentReview = async (capture) => {
      if (capture.deliveryStatus === 'sent') throw new Error('terminal snapshot unavailable');
      h.captures.push(capture);
    };
    const sent = await sendSupportTicketEmailReply(input, h.dependencies);
    assert.equal(sent.status, 'sent');
    assert.equal(sent.sent, true);
    assert.equal(sent.reason, 'review_capture_pending');
    assert.equal(h.captures.length, 1);
    assert.equal(h.captures[0].deliveryStatus, 'sending');
    assert.equal(h.captures[0].composedBody, 'Hello');
    assert.equal(h.captures[0].draftSnapshotId, 6);
    assert.equal(h.captures[0].sourceMessageId, 10);
    assert.equal(h.captures[0].threadRevision, '10');
    const duplicate = await sendSupportTicketEmailReply(input, h.dependencies);
    assert.equal(duplicate.status, 'sent');
    assert.equal(duplicate.duplicate, true);
    assert.equal(h.sends.length, 1);
  } finally { if (oldKey == null) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = oldKey; }
});

test('ownership, stale conversation, personal sender and incorrect draft fail before provider send', async () => {
  for (const [changes, options, draftError] of [
    [{}, { claimedBy: 6 }], [{ expectedLastMessageId: 9 }, {}], [{ expectedLastMessageId: null }, {}],
    [{ senderIdentityId: 99 }, {}], [{}, {}, true]
  ]) {
    const h = harness(options);
    if (draftError) h.review.resolveDraftSnapshotForSend = async () => { throw new Error('wrong draft ticket'); };
    await assert.rejects(sendSupportTicketEmailReply({ ...input, ...changes }, h.dependencies));
    assert.equal(h.sends.length, 0);
    assert.equal(h.statements.some((s) => s.sql.startsWith('INSERT INTO support_ticket_messages')), false);
  }
});

test('missing encryption key fails closed before writing or sending the reply', async () => {
  const oldKey = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  try {
    const h = harness();
    await assert.rejects(sendSupportTicketEmailReply(input, h.dependencies), /encryption key not configured/);
    assert.equal(h.sends.length, 0);
    assert.equal(h.statements.some((s) => s.sql.startsWith('INSERT INTO support_ticket_messages')), false);
  } finally { if (oldKey != null) process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = oldKey; }
});

test('managed senders are same-agency active shared identities; identity reply-to never selects a personal mailbox', () => {
  const shared = { agency_id: 2, identity_key: 'schools', from_email: 'schools@agency.test', is_active: 1 };
  assert.equal(isManagedSupportIdentity(shared, { agencyId: 2 }), true);
  assert.equal(isManagedSupportIdentity(shared, { agencyId: 3 }), false);
  assert.equal(isManagedSupportIdentity({ ...shared, is_active: 0 }, { agencyId: 2 }), false);
  assert.equal(isManagedSupportIdentity({ ...shared, owner_user_id: 5 }, { agencyId: 2 }), false);
  assert.equal(isManagedSupportIdentity({ ...shared, identity_key: 'personal_5' }, { agencyId: 2 }), false);
  assert.equal(isManagedSupportIdentity(shared, { agencyId: 2, topic: 'technology' }), false);
});

test('thread headers follow last delivered/received message, never failed or internal notes', () => {
  const headers = supportReplyHeaders({ subject: 'Question' }, [
    { internet_message_id: '<inbound@school.test>', send_status: 'received', gmail_thread_id: 'g1', references_header: '<older@school.test>' },
    { internet_message_id: '<failed@agency.test>', send_status: 'failed' }
  ]);
  assert.equal(headers.inReplyTo, '<inbound@school.test>');
  assert.equal(headers.references, '<older@school.test> <inbound@school.test>');
  assert.equal(headers.threadId, 'g1');
});

test('history does not turn deleted notes, closure events or legacy unsent text into sent email', () => {
  assert.equal(classifyTicketHistoryMessage({ is_deleted: 1 }), null);
  assert.equal(classifyTicketHistoryMessage({ author_role: 'admin', is_internal: 1 }).direction, 'internal');
  assert.equal(classifyTicketHistoryMessage({ author_role: 'admin', body: 'Ticket closed' }).direction, 'internal');
  assert.equal(classifyTicketHistoryMessage({ author_role: 'support', body: 'Reply' }).sendStatus, 'unverified');
  assert.equal(classifyTicketHistoryMessage({ author_role: 'system_email' }).sendStatus, 'received');
  assert.equal(classifyTicketHistoryMessage({}, { direction: 'outbound', send_status: 'queued' }).sendStatus, 'queued');
});

test('claiming an old duplicate cannot move a mapped or already-recorded email conversation', () => {
  const recorded = { id: 10, claimed_by_user_id: null, first_email_id: 31 };
  const newlyClaimed = { id: 9, claimed_by_user_id: 5, first_email_id: null };
  assert.equal(chooseCanonicalSupportTicket([newlyClaimed, recorded]).id, 10);
  assert.equal(chooseCanonicalSupportTicket([{ ...newlyClaimed, canonical_ticket_id: 10 }, { ...recorded, canonical_ticket_id: 10 }]).id, 10);
  assert.equal(chooseCanonicalSupportTicket([{ id: 1 }, { id: 2, claimed_by_user_id: 5 }, { id: 3 }]).id, 2);
  assert.equal(chooseCanonicalSupportTicket([{ id: 1 }, { id: 3 }]).id, 3);
});
