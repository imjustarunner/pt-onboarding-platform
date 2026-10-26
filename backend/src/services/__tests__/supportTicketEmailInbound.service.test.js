import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { ingestSupportTicketEmail, loadLinkedSupportClientDraftFacts } from '../supportTicketEmailInbound.service.js';
import { parseSupportGmailMessage, reconcileSupportTicketThreadFromGmail } from '../supportTicketGmailReconciliation.service.js';
test.after(() => pool.end());

function clientFactsFixture({ scope = true, membership = true, providerFailure = null, providers = [{ id: 12, first_name: 'Drew', last_name: 'Therapist' }], primarySchool = 8 } = {}) {
  const reads = [], lookups = [];
  const ticket = { client_id: 22, agency_id: 2, school_organization_id: 8 };
  const database = { async execute(sql, values) {
    reads.push({ sql, values });
    assert.equal((sql.match(/\?/g) || []).length, values.length);
    if (sql.includes('FROM clients')) return [scope ? [{ id: 22, agency_id: 2, organization_id: primarySchool, provider_id: 99, status: 'CURRENT' }] : []];
    if (sql.includes('FROM client_organization_assignments')) return [membership ? [{ assigned: 1 }] : []];
    if (sql.includes('FROM client_provider_assignments')) {
      if (providerFailure) throw providerFailure;
      return [providers];
    }
    if (sql.includes('FROM users')) return [[{ id: 99, first_name: 'Legacy', last_name: 'Therapist' }]];
    throw new Error(`Unexpected client fact SQL: ${sql}`);
  } };
  const findClient = async (id) => {
    lookups.push(id);
    return { id: 22, agency_id: 2, organization_id: primarySchool, initials: 'AB', identifier_code: 'client22',
      status: 'CURRENT', client_status_label: 'Current', paperwork_status_label: 'Complete', service_day: 'Monday',
      provider_name: 'Stale Therapist', clinical_notes: 'PRIVATE CLINICAL NOTE', full_name: 'PRIVATE FULL NAME',
      guardian_email: 'private@example.test', diagnosis: 'PRIVATE DIAGNOSIS' };
  };
  return { ticket, dependencies: { database, findClient }, reads, lookups };
}

test('automatic draft context uses current scoped assignments and excludes clinical/contact fields and stale provider name', async () => {
  const f = clientFactsFixture();
  const facts = await loadLinkedSupportClientDraftFacts(f.ticket, f.dependencies);
  assert.deepEqual(facts.verifiedFacts, [{ key: 'assigned_provider', value: 'Drew Therapist', source: 'Current active client assignment in this school', shareable: true }]);
  assert.equal(facts.client.initials, 'AB');
  assert.equal(facts.client.service_day, 'Monday');
  assert.match(facts.participants[0].role, /not the client/);
  assert.deepEqual(facts.contextUnknowns, []);
  assert.doesNotMatch(JSON.stringify(facts), /PRIVATE|Stale Therapist|Legacy Therapist|private@example/);
  assert.deepEqual(f.lookups, [22]);
  assert.deepEqual(f.reads.find((r) => r.sql.includes('FROM client_provider_assignments')).values, [22, 8]);
});

test('automatic context never matches a client by a name in the email', async () => {
  const f = clientFactsFixture();
  const facts = await loadLinkedSupportClientDraftFacts({ ...f.ticket, client_id: null, question: 'AB needs Drew Therapist' }, f.dependencies);
  assert.equal(facts.client, null);
  assert.deepEqual(facts.verifiedFacts, []);
  assert.equal(f.reads.length, 0);
  assert.equal(f.lookups.length, 0);
});

test('client facts require the ticket agency and active school membership before loading details', async () => {
  for (const options of [{ scope: false }, { membership: false }]) {
    const f = clientFactsFixture(options);
    const facts = await loadLinkedSupportClientDraftFacts(f.ticket, f.dependencies);
    assert.equal(facts.client, null);
    assert.deepEqual(facts.verifiedFacts, []);
    assert.ok(facts.contextUnknowns.includes('linked_client_context_unavailable'));
    assert.equal(f.lookups.length, 0);
    assert.equal(f.reads.some((r) => r.sql.includes('FROM client_provider_assignments')), false);
  }
});

test('secondary school gets only its active providers and cannot use primary school schedule or legacy provider', async () => {
  const f = clientFactsFixture({ primarySchool: 18, providers: [] });
  const facts = await loadLinkedSupportClientDraftFacts(f.ticket, f.dependencies);
  assert.equal(facts.client.initials, 'AB');
  assert.equal(facts.client.service_day, undefined);
  assert.deepEqual(facts.verifiedFacts, []);
  assert.ok(facts.contextUnknowns.includes('assigned_provider_unconfirmed'));
  assert.equal(f.reads.some((r) => r.sql.includes('FROM users')), false);
});

test('legacy provider fallback is limited to the current primary school without active assignments', async () => {
  const f = clientFactsFixture({ providers: [] });
  const facts = await loadLinkedSupportClientDraftFacts(f.ticket, f.dependencies);
  assert.equal(facts.verifiedFacts[0].value, 'Legacy Therapist');
  assert.match(f.reads.find((r) => r.sql.includes('FROM users')).sql, /is_active/);
});

test('provider query outage stays unknown and does not promote stale legacy assignment', async () => {
  const f = clientFactsFixture({ providerFailure: Object.assign(new Error('Read unavailable'), { code: 'ETIMEDOUT' }) });
  const facts = await loadLinkedSupportClientDraftFacts(f.ticket, f.dependencies);
  assert.equal(facts.client.initials, 'AB');
  assert.deepEqual(facts.verifiedFacts, []);
  assert.ok(facts.contextUnknowns.includes('assigned_provider_unconfirmed'));
  assert.equal(f.reads.some((r) => r.sql.includes('FROM users')), false);
});

function fixture({ staffCopy = false, initialReceipt = null, attachmentFailure = false, reviewFailure = false } = {}) {
  const statements = [], captures = [], generations = [];
  let receipt = initialReceipt;
  const ticket = { id: 7, agency_id: 2, school_organization_id: 8, source_email_message_id: '<original@school.test>',
    source_email_from: 'school@district.test', status: 'closed', claimed_by_user_id: 5 };
  const db = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async execute(sql, values = []) {
    statements.push({ sql, values });
    assert.equal((sql.match(/\?/g) || []).length, values.length, sql);
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    if (sql.startsWith('SELECT * FROM support_ticket_email_messages')) return [receipt ? [receipt] : []];
    if (sql.startsWith('SELECT * FROM support_tickets')) return [[ticket]];
    if (sql.startsWith('SELECT t.* FROM support_tickets')) return [[ticket]];
    if (sql.startsWith('SELECT ticket_id,internet_message_id')) return [[]];
    if (sql.startsWith('INSERT INTO support_ticket_messages')) return [{ insertId: 11 }];
    if (sql.startsWith('INSERT INTO support_ticket_email_messages')) {
      receipt = { ticket_id: 7, ticket_message_id: 11, direction: staffCopy ? 'outbound' : 'inbound' };
      return [{ insertId: 21 }];
    }
    if (sql.startsWith('UPDATE support_tickets')) { ticket.status = 'open'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT ticket_message_id AS id')) return [[{ id: 4 }]];
    throw new Error(`Unexpected SQL ${sql}`);
  } };
  const dependencies = { database: { getConnection: async () => db, execute: (...args) => db.execute(...args) },
    persistAttachments: async () => ({ complete: !attachmentFailure, incomplete: attachmentFailure }),
    generateDraft: async (input) => generations.push(input), syncInbox: async () => {},
    review: { captureExternalReplyReview: async (input) => { captures.push(input); if (reviewFailure) throw new Error('review temporarily unavailable'); } } };
  return { dependencies, statements, captures, generations, ticket };
}

const base = { agencyId: 2, fromEmail: 'school@district.test', messageId: '<follow-up@district.test>', threadId: 'thread1',
  bodyText: 'Please check the attachment.', subject: 'Re: Referral', gmailMessageId: 'gmail1', payload: {},
  receivedAt: new Date('2026-10-26T10:00:00Z') };

async function withKey(run) {
  const old = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 4).toString('base64');
  try { await run(); } finally { if (old == null) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = old; }
}

test('school follow-up appends to same closed ticket, reopens it and preserves claimant', async () => withKey(async () => {
  const f = fixture();
  const saved = await ingestSupportTicketEmail(base, f.dependencies);
  assert.equal(saved.ticketId, 7);
  assert.equal(saved.ticketMessageId, 11);
  assert.equal(f.ticket.status, 'open');
  assert.equal(f.ticket.claimed_by_user_id, 5);
  assert.equal(f.generations.length, 1);
  assert.equal(f.generations[0].intakeComplete, true);
  assert.equal(f.statements.some((s) => s.sql.startsWith('INSERT INTO support_tickets')), false);
}));

test('staff Gmail copy captures actual historical reply with provider evidence and preserves closed state', async () => withKey(async () => {
  const f = fixture({ staffCopy: true });
  const saved = await ingestSupportTicketEmail({ ...base, fromEmail: 'hannah@agency.test', staffCopy: true, staffUserId: 5 }, f.dependencies);
  assert.equal(saved.ticketId, 7);
  assert.equal(f.ticket.status, 'closed');
  assert.equal(f.generations.length, 0);
  assert.equal(f.captures[0].transportMessageId, 'gmail1');
  assert.equal(f.captures[0].sourceMessageId, 4);
  assert.equal(f.captures[0].occurredAt, base.receivedAt);
  assert.equal(f.captures[0].body, base.bodyText);
  assert.equal(f.statements.some((s) => s.sql.startsWith('UPDATE support_tickets')), false);
}));

test('Gmail echoes preserve authoritative app draft association and leave queued delivery reconciliation intact', async () => withKey(async () => {
  for (const initialReceipt of [
    { direction: 'outbound', send_status: 'sent', communication_id: 40, draft_snapshot_id: 31 },
    { direction: 'outbound', send_status: 'queued', communication_id: 40, draft_snapshot_id: 31 },
    { direction: 'outbound', send_status: 'sending', client_request_key: 'reserved-app-request', draft_snapshot_id: 31 }
  ]) {
    Object.assign(initialReceipt, { ticket_id: 7, ticket_message_id: 11 });
    const originalReceipt = structuredClone(initialReceipt);
    const f = fixture({ initialReceipt, staffCopy: true });
    const saved = await ingestSupportTicketEmail({ ...base, fromEmail: 'schools@agency.test', staffCopy: true, staffUserId: null }, f.dependencies);
    assert.equal(saved.duplicate, true);
    assert.equal(saved.ticketMessageId, 11);
    assert.equal(f.captures.length, 0, 'echo must not replace app delivery review with external reply');
    assert.equal(f.generations.length, 0);
    assert.deepEqual(initialReceipt, originalReceipt, 'queue state, original composition link and draft association belong to delivery reconciliation');
    assert.equal(f.statements.some((s) => /^(INSERT|UPDATE) /.test(s.sql)), false);
    assert.equal(f.ticket.status, 'closed');
  }
}));

test('known app-origin echo cannot generate a draft even when sender classification is unavailable', async () => withKey(async () => {
  const f = fixture({ initialReceipt: { direction: 'outbound', send_status: 'sent', client_request_key: 'app-request', ticket_id: 7, ticket_message_id: 11 } });
  await ingestSupportTicketEmail(base, f.dependencies);
  assert.equal(f.generations.length, 0);
  assert.equal(f.captures.length, 0);
}));

test('historical inbound capture never reopens ticket, changes claim or generates a new draft', async () => withKey(async () => {
  const f = fixture();
  await ingestSupportTicketEmail({ ...base, preserveTicketState: true, generateDraft: false, createIfMissing: false }, f.dependencies);
  assert.equal(f.ticket.status, 'closed');
  assert.equal(f.ticket.claimed_by_user_id, 5);
  assert.equal(f.generations.length, 0);
  assert.equal(f.statements.some((s) => s.sql.startsWith('UPDATE support_tickets')), false);
}));

test('attachment failure defers generation and acknowledgement; retry repairs attachment before draft without another message', async () => withKey(async () => {
  const f = fixture({ attachmentFailure: true });
  await assert.rejects(ingestSupportTicketEmail(base, f.dependencies), { code: 'SUPPORT_EMAIL_ATTACHMENTS_PENDING' });
  assert.equal(f.generations.length, 0);
  f.dependencies.persistAttachments = async () => ({ complete: true });
  const retry = await ingestSupportTicketEmail(base, f.dependencies);
  assert.equal(retry.duplicate, true);
  assert.equal(f.generations.length, 1);
  assert.equal(f.statements.filter((s) => s.sql.startsWith('INSERT INTO support_ticket_messages')).length, 1);
}));

test('duplicate Gmail retry still completes a failed immutable external review snapshot', async () => withKey(async () => {
  const f = fixture({ staffCopy: true, reviewFailure: true });
  const input = { ...base, staffCopy: true, staffUserId: 5 };
  await assert.rejects(ingestSupportTicketEmail(input, f.dependencies), /review temporarily unavailable/);
  f.dependencies.review.captureExternalReplyReview = async (capture) => f.captures.push(capture);
  const retry = await ingestSupportTicketEmail(input, f.dependencies);
  assert.equal(retry.duplicate, true);
  assert.equal(f.captures.length, 2);
  assert.equal(f.captures[0].idempotencyKey, f.captures[1].idempotencyKey);
  assert.equal(f.statements.filter((s) => s.sql.startsWith('INSERT INTO support_ticket_messages')).length, 1);
}));

const gmailMessage = (from, id, extra = []) => ({ id, threadId: 'thread1', internalDate: String(Date.parse('2026-10-26T10:00:00Z')),
  payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: from }, { name: 'To', value: 'school@district.test' },
    { name: 'Message-ID', value: `<${id}@agency.test>` }, ...extra], body: { data: Buffer.from('Actual reply body').toString('base64url') } } });

test('Gmail parsing unwraps a school group sender and recognizes staff personal/work aliases', () => {
  const options = { ownAddresses: ['schools@agency.test'], staff: [{ id: 5, work_email: 'hannah@agency.test', personal_email: 'hannah@example.test' }] };
  const external = parseSupportGmailMessage(gmailMessage('Counselor via School <schools@agency.test>', 'g1', [
    { name: 'Reply-To', value: 'Counselor <school@district.test>' }, { name: 'List-ID', value: 'school-group' }
  ]), options);
  assert.equal(external.fromEmail, 'school@district.test');
  assert.equal(external.staffCopy, false);
  const staff = parseSupportGmailMessage(gmailMessage('Hannah <hannah@example.test>', 'g2'), options);
  assert.equal(staff.staffCopy, true);
  assert.equal(staff.staffUserId, 5);
  assert.equal(staff.bodyText, 'Actual reply body');
});

test('historical reconciliation is read-only by default and explicitly disables reopening and drafting when applied', async () => {
  const gmail = { users: { threads: { get: async () => ({ data: { messages: [gmailMessage('Hannah <hannah@agency.test>', 'g1')] } }) } } };
  const calls = [];
  const options = { gmail, agencyId: 2, ticketId: 7, threadId: 'thread1', staff: [{ id: 5, email: 'hannah@agency.test' }] };
  const dependencies = { ingest: async (input) => { calls.push(input); return { handled: true }; } };
  const dry = await reconcileSupportTicketThreadFromGmail(options, dependencies);
  assert.equal(dry.staffReplies, 1);
  assert.equal(calls.length, 0);
  await reconcileSupportTicketThreadFromGmail({ ...options, apply: true }, dependencies);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].preserveTicketState, true);
  assert.equal(calls[0].generateDraft, false);
  assert.equal(calls[0].createIfMissing, false);
  assert.equal(calls[0].targetTicketId, 7);
});

test('ongoing reconciliation captures only outbound copies after live intake knows the source, preserving new-inbound reopen handling', async () => {
  const incoming = gmailMessage('School <school@district.test>', 'g0');
  const outgoing = gmailMessage('Hannah <hannah@agency.test>', 'g1');
  outgoing.internalDate = String(Number(incoming.internalDate) + 60000);
  const gmail = { users: { threads: { get: async () => ({ data: { messages: [incoming, outgoing] } }) } } };
  const calls = [];
  const options = { gmail, agencyId: 2, ticketId: 7, threadId: 'thread1', apply: true, outboundOnly: true,
    staff: [{ id: 5, email: 'hannah@agency.test' }] };
  const dependencies = { sourceKnown: async () => false, ingest: async (input) => { calls.push(input); return { handled: true }; } };
  await reconcileSupportTicketThreadFromGmail(options, dependencies);
  assert.equal(calls.length, 0);
  dependencies.sourceKnown = async () => true;
  await reconcileSupportTicketThreadFromGmail(options, dependencies);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].gmailMessageId, 'g1');
  assert.equal(calls[0].staffCopy, true);
  assert.equal(calls[0].preserveTicketState, true);
});
