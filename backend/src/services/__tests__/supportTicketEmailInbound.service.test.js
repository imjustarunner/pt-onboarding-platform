import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { generateInboundSupportDraft, ingestSupportTicketEmail, loadLinkedSupportClientDraftFacts, verifySupportTicketHistoryThread } from '../supportTicketEmailInbound.service.js';
import { parseSupportGmailMessage, reconcileSupportTicketThreadFromGmail } from '../supportTicketGmailReconciliation.service.js';
import { assessSupportEmailDraftReuse, generateSupportEmailDraft } from '../supportEmailDraft.service.js';
test.after(() => pool.end());

function draftReuseFixture({ question = 'Could you help with the portal login?', metadata = {}, attachments = [] } = {}) {
  const updates = [], snapshots = [], reads = [];
  const raw = { id: 7, agency_id: 2, source_channel: 'email', source_email_from: 'counselor@school.test',
    subject: 'School support', question, created_at: '2026-10-26T10:00:00Z', ai_draft_metadata_json: metadata };
  const messages = [{ id: 10, author_role: 'system_email', email_direction: 'inbound', body: question, created_at: raw.created_at }];
  const input = { ticket: raw, messages, attachments, claimant: null, client: null, verifiedFacts: [], participants: [],
    contextUnknowns: [], intakeComplete: true, intakeMessageId: 10 };
  const context = assessSupportEmailDraftReuse(input).context;
  const snapshot = { id: 91, ticketId: 7, agencyId: 2, sourceMessageId: 10, threadRevision: '10',
    body: 'What error appears when you try to sign in?', readable: true, provider: 'vertex',
    model: process.env.SUPPORT_EMAIL_DRAFT_MODEL || 'gemini-2.5-pro',
    sourceEvidence: { evidenceFingerprint: context.evidenceFingerprint, promptVersion: context.version } };
  const database = { async execute(sql, values) {
    if (sql.startsWith('SELECT * FROM support_tickets')) return [[raw]];
    if (sql.startsWith('SELECT m.*')) return [messages];
    if (sql.startsWith('UPDATE support_tickets')) { updates.push({ sql, values }); return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected draft reuse SQL ${sql}`);
  } };
  const dependencies = { database,
    listTicketAttachments: async () => { reads.push('current_attachments'); return attachments; },
    review: { getLatestDraftSnapshot: async () => { reads.push('snapshot'); return snapshot; },
      recordDraftSnapshot: async (value) => { snapshots.push(value); return { ...value, id: 92, readable: true }; } } };
  return { input, context, snapshot, dependencies, updates, snapshots, reads };
}

test('current broadcast evidence suppresses a cached same-revision draft before any model call', async () => {
  const f = draftReuseFixture({ question: 'Get booked across booking channels. You only pay for new bookings. Unsubscribe.',
    metadata: { inboundEmailHeaders: { listUnsubscribe: true }, inboundEmailHeadersMessageId: 10 } });
  const before = structuredClone(f.snapshot);
  f.dependencies.generateSupportEmailDraft = (input) => generateSupportEmailDraft(input, {
    generateText: () => assert.fail('restored headers must suppress without a model call')
  });
  const result = await generateInboundSupportDraft({ ticketId: 7, sourceMessageId: 10, agencyId: 2, intakeComplete: true }, f.dependencies);
  assert.equal(result.suppressed, true);
  assert.equal(result.suppressionReason, 'marketing_or_newsletter');
  assert.equal(f.snapshots.length, 0);
  assert.deepEqual(f.snapshot, before, 'old immutable draft evidence remains unchanged');
  assert.match(f.updates[0].sql, /ai_draft_response=NULL,ai_draft_status='suppressed'/);
  assert.equal(JSON.parse(f.updates[0].values[0]).draftSnapshotId, null);
  assert.deepEqual(f.reads, ['current_attachments', 'snapshot']);
});

test('identical current evidence reuses the validated snapshot after reading attachment inventory', async () => {
  const f = draftReuseFixture();
  f.dependencies.generateSupportEmailDraft = () => assert.fail('matching evidence must reuse the current draft');
  const result = await generateInboundSupportDraft({ ticketId: 7, sourceMessageId: 10, agencyId: 2, intakeComplete: true }, f.dependencies);
  assert.equal(result.id, 91);
  assert.equal(f.updates.length, 0);
  assert.equal(f.snapshots.length, 0);
  assert.deepEqual(f.reads, ['current_attachments', 'snapshot']);
});

test('changed evidence regenerates at the same revision and persists the immutable concurrent winner exactly', async () => {
  const f = draftReuseFixture({ attachments: [{ id: 8, file_name: 'portal-error.png', support_ticket_message_id: 10 }] });
  f.snapshot.sourceEvidence.evidenceFingerprint = 'previous-evidence';
  const winnerBody = 'What error appears when you open the portal?';
  const winnerEvidence = { ...f.context, evidenceFingerprint: f.context.evidenceFingerprint, promptVersion: f.context.version, winningGeneration: true };
  f.dependencies.generateSupportEmailDraft = async () => ({ text: 'Please tell me what error appears.',
    provider: 'vertex', modelName: f.snapshot.model,
    metadata: { evidenceFingerprint: f.context.evidenceFingerprint, promptVersion: f.context.version } });
  f.dependencies.review.recordDraftSnapshot = async (value) => {
    f.snapshots.push(value);
    return { ...value, id: 92, readable: true, body: winnerBody, sourceEvidence: winnerEvidence };
  };
  const result = await generateInboundSupportDraft({ ticketId: 7, sourceMessageId: 10, agencyId: 2, intakeComplete: true }, f.dependencies);
  assert.equal(f.snapshots[0].requestKey, `inbound:10:10:${f.context.evidenceFingerprint}:replaces:91`);
  assert.equal(f.snapshots[0].threadRevision, '10');
  assert.equal(f.updates[0].values[0], winnerBody);
  assert.equal(JSON.parse(f.updates[0].values[1]).winningGeneration, true);
  assert.equal(JSON.parse(f.updates[0].values[1]).draftSnapshotId, 92);
  assert.equal(result.text, winnerBody);
});

test('a rejected same-fingerprint body receives a replacement key instead of returning its old immutable snapshot', async () => {
  const f = draftReuseFixture();
  f.snapshot.body = 'Thanks, [Your Name]';
  f.dependencies.generateSupportEmailDraft = async () => ({ text: 'What error appears when you sign in?',
    metadata: { evidenceFingerprint: f.context.evidenceFingerprint, promptVersion: f.context.version } });
  await generateInboundSupportDraft({ ticketId: 7, sourceMessageId: 10, agencyId: 2, intakeComplete: true }, f.dependencies);
  assert.match(f.snapshots[0].requestKey, /:replaces:91$/);
  assert.equal(f.updates[0].values[0], 'What error appears when you sign in?');
});

test('automatic suppression clears a legacy draft and snapshot link only at the generated conversation revision', async () => {
  const updates = [], snapshots = [];
  const raw = { id: 7, agency_id: 2, question: 'Newsletter', ai_draft_response: 'Old inappropriate newsletter reply',
    ai_draft_metadata_json: { draftSnapshotId: 91, inboundEmailHeaders: { listId: 'newsletter' } } };
  const database = { async execute(sql, values) {
    if (sql.startsWith('SELECT * FROM support_tickets')) return [[raw]];
    if (sql.startsWith('SELECT m.*')) return [[{ id: 10, body: 'Newsletter', email_direction: 'inbound' }]];
    if (sql.startsWith('UPDATE support_tickets')) { updates.push({ sql, values }); return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected suppression SQL ${sql}`);
  } };
  const result = await generateInboundSupportDraft({ ticketId: 7, sourceMessageId: 10, agencyId: 2, intakeComplete: true }, {
    database, listTicketAttachments: async () => [],
    review: { getLatestDraftSnapshot: async () => null, recordDraftSnapshot: async (value) => snapshots.push(value) },
    generateSupportEmailDraft: async () => ({ text: '', suppressed: true, suppressionReason: 'informational_broadcast', metadata: { promptVersion: 'current' } })
  });
  assert.equal(result.suppressed, true);
  assert.equal(snapshots.length, 0);
  assert.equal(updates.length, 1);
  const { sql, values } = updates[0];
  assert.match(sql, /ai_draft_response=NULL,ai_draft_status='suppressed'/);
  assert.match(sql, /AND \?=\(SELECT COALESCE\(MAX\(m.id\),0\)/);
  assert.deepEqual(values.slice(1), [7, 10]);
  const metadata = JSON.parse(values[0]);
  assert.equal(metadata.draftSnapshotId, null);
  assert.equal(metadata.suppressed, true);
  assert.equal(metadata.suppressionReason, 'informational_broadcast');
  assert.equal(metadata.threadRevision, '10');
  assert.deepEqual(metadata.inboundEmailHeaders, { listId: 'newsletter' });
});

test('late attachment completion for an earlier inbound cannot generate or suppress the latest draft', async () => {
  const database = { async execute(sql) {
    if (sql.startsWith('SELECT * FROM support_tickets')) return [[{ id: 7, agency_id: 2 }]];
    if (sql.startsWith('SELECT m.*')) return [[
      { id: 10, email_direction: 'inbound', created_at: '2026-10-25T10:00:00Z' },
      { id: 12, email_direction: 'inbound', created_at: '2026-10-26T10:00:00Z' }
    ]];
    throw new Error(`An earlier receipt must not update latest draft: ${sql}`);
  } };
  const result = await generateInboundSupportDraft({ ticketId: 7, sourceMessageId: 10, agencyId: 2, intakeComplete: true }, {
    database, review: { getLatestDraftSnapshot: async () => { throw new Error('No earlier-source snapshot lookup'); } },
    generateSupportEmailDraft: async () => { throw new Error('No earlier-source generation'); }
  });
  assert.equal(result, null);
});

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

function fixture({ staffCopy = false, initialReceipt = null, attachmentFailure = false, reviewFailure = false, historyScopes = null } = {}) {
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
    if (sql.startsWith('SELECT * FROM support_tickets') && sql.includes('BINARY source_email_thread_id')) {
      return [Number(values[0]) === ticket.id && Number(values[1]) === ticket.agency_id && values[2] === ticket.source_email_thread_id ? [ticket] : []];
    }
    if (sql.startsWith('SELECT * FROM support_tickets')) return [[ticket]];
    if (sql.startsWith('SELECT t.* FROM support_tickets')) return [[ticket]];
    if (sql.startsWith('SELECT school_organization_id,client_id,topic')) return [historyScopes || [ticket]];
    if (sql.startsWith('SELECT from_email,to_json,cc_json') || sql.startsWith('SELECT p.id FROM communication_participants')) return [[]];
    if (sql.startsWith('INSERT INTO support_ticket_email_thread_sync')) return [{ affectedRows: 1 }];
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

function historyProof(threadId = 'thread1', agencyId = 2, ticketId = 7) {
  return verifySupportTicketHistoryThread({ providerThread: { id: threadId, messages: [{ threadId }] }, agencyId, ticketId, threadId });
}

test('provider-verified historical thread recovers rewritten group sender only into fixed same-scope target', async () => withKey(async () => {
  const f = fixture();
  f.ticket.source_email_from = 'schools@agency.test';
  f.ticket.source_email_thread_id = 'thread1';
  const result = await ingestSupportTicketEmail({ ...base, targetTicketId: 7, createIfMissing: false,
    generateDraft: false, preserveTicketState: true, historyThreadVerification: historyProof() }, f.dependencies);
  assert.equal(result.handled, true);
  assert.equal(result.ticketId, 7);
  assert.equal(f.ticket.status, 'closed');
  assert.equal(f.ticket.claimed_by_user_id, 5);
  assert.equal(f.generations.length, 0);
  assert.equal(f.statements.some((s) => s.sql.startsWith('UPDATE support_tickets') || s.sql.startsWith('INSERT INTO support_tickets')), false);
  const scope = f.statements.find((s) => s.sql.startsWith('SELECT school_organization_id,client_id,topic'));
  assert.deepEqual(scope.values, [2, 'thread1']);
}));

test('history capability cannot bypass live participant checks, be forged, change target, or cross scopes', async () => withKey(async () => {
  for (const override of [{ historyThreadVerification: {} }, { generateDraft: true }, { preserveTicketState: false },
    { targetTicketId: 8 }, { historyThreadVerification: historyProof('thread1', 3) }]) {
    const f = fixture(); f.ticket.source_email_from = 'schools@agency.test';
    const result = await ingestSupportTicketEmail({ ...base, targetTicketId: 7, createIfMissing: false,
      generateDraft: false, preserveTicketState: true, historyThreadVerification: historyProof(), ...override }, f.dependencies);
    assert.equal(result.handled, false);
    assert.equal(f.statements.some((s) => s.sql.startsWith('INSERT INTO')), false);
  }
  const f = fixture({ historyScopes: [{ school_organization_id: 8 }, { school_organization_id: 9 }] });
  f.ticket.source_email_from = 'schools@agency.test'; f.ticket.source_email_thread_id = 'thread1';
  await assert.rejects(ingestSupportTicketEmail({ ...base, targetTicketId: 7, createIfMissing: false,
    generateDraft: false, preserveTicketState: true, historyThreadVerification: historyProof() }, f.dependencies), { code: 'SUPPORT_HISTORY_SCOPE_AMBIGUOUS' });
  assert.equal(f.statements.some((s) => s.sql.startsWith('INSERT INTO')), false);
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

test('new inbound clears earlier attachment completion before a failed inventory and binds the repaired receipt to this message', async () => withKey(async () => {
  const f = fixture({ attachmentFailure: true });
  f.ticket.ai_draft_metadata_json = { attachmentsIngested: true, attachmentsIngestedMessageId: 4, attachmentsIngestedGmailMessageId: 'old-gmail' };
  await assert.rejects(ingestSupportTicketEmail(base, f.dependencies), { code: 'SUPPORT_EMAIL_ATTACHMENTS_PENDING' });
  const invalidation = f.statements.find((s) => s.sql.includes("'$.attachmentsIngested',CAST('false' AS JSON)"));
  assert.ok(invalidation);
  assert.match(invalidation.sql, /'\$\.inboundEmailHeadersMessageId',\?,'\$\.inboundEmailHeadersGmailMessageId',\?/);
  assert.deepEqual(invalidation.values.slice(3, 5), [11, 'gmail1']);
  assert.match(invalidation.sql, /'\$\.attachmentsIngestedMessageId',NULL,'\$\.attachmentsIngestedGmailMessageId',NULL/);
  assert.equal(f.statements.some((s) => s.sql.includes("'$.attachmentsIngested',CAST('true' AS JSON)")), false);
  f.dependencies.persistAttachments = async () => ({ complete: true, incomplete: false });
  await ingestSupportTicketEmail(base, f.dependencies);
  const completion = f.statements.find((s) => s.sql.includes("'$.attachmentsIngested',CAST('true' AS JSON)"));
  assert.deepEqual(completion.values, [11, 'gmail1', 7, 11]);
  assert.match(completion.sql, /AND \?=\(SELECT e.ticket_message_id/);
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
  const options = { ownAddresses: ['schools@agency.test'], staff: [{ id: 5, role: 'support', work_email: 'hannah@agency.test', personal_email: 'hannah@example.test' }] };
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

test('provider accounts remain requesters while managed shared aliases and support responders remain outbound', () => {
  for (const role of ['provider', 'provider_plus', 'supervisor', 'school_staff', 'client_guardian', undefined]) {
    const options = { ownAddresses: ['schools@agency.test'], staff: [{ id: 9, role, work_email: 'therapist@agency.test' }] };
    for (const message of [gmailMessage('Therapist <therapist@agency.test>', 'provider'),
      gmailMessage('Therapist via School <schools@agency.test>', 'relayed', [
        { name: 'X-Original-Sender', value: 'therapist@agency.test' }, { name: 'List-ID', value: 'school-group' }
      ])]) {
      const incoming = parseSupportGmailMessage(message, options);
      assert.equal(incoming.staffCopy, false, `${role || 'unknown role'} is not inferred to be support`);
      assert.equal(incoming.staffUserId, null);
      assert.equal(incoming.createdByUserId, 9);
    }
    const shared = parseSupportGmailMessage(gmailMessage('School Team <schools@agency.test>', 'shared'), options);
    assert.equal(shared.staffCopy, true);
    assert.equal(shared.staffUserId, null, 'a shared From address does not invent its author');
  }
  for (const role of ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant']) {
    const parsed = parseSupportGmailMessage(gmailMessage('Support <helper@agency.test>', role), {
      staff: [{ id: 5, role, work_email: 'helper@agency.test' }]
    });
    assert.equal(parsed.staffCopy, true);
    assert.equal(parsed.staffUserId, 5);
  }
});

test('provider requests reopen their conversation and draft without creating a false sent review', async () => withKey(async () => {
  for (const role of ['provider', 'provider_plus']) {
    const f = fixture();
    f.ticket.source_email_from = 'therapist@agency.test';
    const parsed = parseSupportGmailMessage(gmailMessage('Therapist <therapist@agency.test>', role), {
      staff: [{ id: 9, role, work_email: 'therapist@agency.test' }]
    });
    await ingestSupportTicketEmail({ ...parsed, agencyId: 2 }, f.dependencies);
    assert.equal(f.ticket.status, 'open');
    assert.equal(f.ticket.claimed_by_user_id, 5);
    assert.equal(f.captures.length, 0);
    assert.equal(f.generations.length, 1);
    const canonical = f.statements.find((s) => s.sql.startsWith('INSERT INTO support_ticket_messages'));
    assert.deepEqual(canonical.values.slice(0, 3), [7, 9, 'system_email']);
    const receipt = f.statements.find((s) => s.sql.startsWith('INSERT INTO support_ticket_email_messages'));
    assert.deepEqual(receipt.values.slice(3, 5), ['inbound', 'received']);
  }
}));

test('outbound-only reconciliation waits for provider request intake before capturing a support reply', async () => {
  const incoming = gmailMessage('Therapist <therapist@agency.test>', 'provider');
  const outgoing = gmailMessage('Support <helper@agency.test>', 'support');
  outgoing.internalDate = String(Number(incoming.internalDate) + 60000);
  const gmail = { users: { threads: { get: async () => ({ data: { id: 'thread1', messages: [incoming, outgoing] } }) } } };
  const calls = [], sources = [];
  const options = { gmail, agencyId: 2, ticketId: 7, threadId: 'thread1', apply: true, outboundOnly: true,
    staff: [{ id: 9, role: 'provider_plus', work_email: 'therapist@agency.test' },
      { id: 5, role: 'support', work_email: 'helper@agency.test' }] };
  const deps = { sourceKnown: async (source) => { sources.push(source.gmailMessageId); return false; },
    ingest: async (input) => { calls.push(input); return { handled: true }; } };
  await reconcileSupportTicketThreadFromGmail(options, deps);
  assert.deepEqual(sources, ['provider']);
  assert.equal(calls.length, 0);
  deps.sourceKnown = async () => true;
  await reconcileSupportTicketThreadFromGmail(options, deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].gmailMessageId, 'support');
});

test('historical reconciliation is read-only by default and explicitly disables reopening and drafting when applied', async () => {
  const gmail = { users: { threads: { get: async () => ({ data: { id: 'thread1', messages: [gmailMessage('Hannah <hannah@agency.test>', 'g1')] } }) } } };
  const calls = [];
  const options = { gmail, agencyId: 2, ticketId: 7, threadId: 'thread1', staff: [{ id: 5, role: 'support', email: 'hannah@agency.test' }] };
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

test('historical reconciliation rejects provider thread or contained-message mismatches before intake', async () => {
  for (const data of [
    { id: 'wrong-thread', messages: [gmailMessage('School <school@district.test>', 'g0')] },
    { id: 'thread1', messages: [{ ...gmailMessage('School <school@district.test>', 'g0'), threadId: 'wrong-thread' }] }
  ]) {
    const gmail = { users: { threads: { get: async () => ({ data }) } } };
    let calls = 0;
    await assert.rejects(reconcileSupportTicketThreadFromGmail({ gmail, agencyId: 2, ticketId: 7, threadId: 'thread1', apply: true },
      { ingest: async () => { calls += 1; } }), { code: 'SUPPORT_HISTORY_THREAD_UNVERIFIED' });
    assert.equal(calls, 0);
  }
});

test('ongoing reconciliation captures only outbound copies after live intake knows the source, preserving new-inbound reopen handling', async () => {
  const incoming = gmailMessage('School <school@district.test>', 'g0');
  const outgoing = gmailMessage('Hannah <hannah@agency.test>', 'g1');
  outgoing.internalDate = String(Number(incoming.internalDate) + 60000);
  const gmail = { users: { threads: { get: async () => ({ data: { messages: [incoming, outgoing] } }) } } };
  const calls = [];
  const options = { gmail, agencyId: 2, ticketId: 7, threadId: 'thread1', apply: true, outboundOnly: true,
    staff: [{ id: 5, role: 'support', email: 'hannah@agency.test' }] };
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
