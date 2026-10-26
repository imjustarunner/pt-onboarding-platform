import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import pool from '../../config/database.js';
import { ingestTicketAttachmentsFromGmail, persistGmailAttachmentsForTicket } from '../unifiedEmail/ticketInboundAttachments.service.js';
test.after(() => pool.end());

function harness({ metadata = {}, complete = true, latest = { ticket_message_id: 12, gmail_message_id: 'current-gmail', internet_message_id: '<current@test>' }, legacy = [] } = {}) {
  const updates = [], fetched = [], persisted = [];
  const database = { async execute(sql, values) {
    assert.equal((sql.match(/\?/g) || []).length, values.length);
    if (sql.startsWith('SELECT e.ticket_message_id')) return [latest ? [latest] : []];
    if (sql.startsWith('SELECT id FROM support_ticket_messages')) return [legacy];
    if (sql.startsWith('UPDATE support_tickets')) { updates.push({ sql, values }); return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected attachment query ${sql}`);
  } };
  const gmail = { users: { messages: { get: async ({ id }) => { fetched.push(id); return { data: { payload: { mimeType: 'text/plain' } } }; } } } };
  return { ticket: { id: 7, source_email_message_id: '<original@test>', ai_draft_metadata_json: metadata }, updates, fetched, persisted,
    dependencies: { database, getGmailClient: async () => gmail,
      listTicketAttachments: async () => [{ id: 1, file_name: 'earlier.pdf', support_ticket_message_id: 4 }],
      persistAttachments: async (input) => { persisted.push(input); return { saved: 0, complete, incomplete: !complete }; } } };
}

test('old attachment-complete flag cannot skip latest inbound inventory or promote historical files after failure', async () => {
  const f = harness({ metadata: { attachmentsIngested: true, attachmentsIngestedMessageId: 4, attachmentsIngestedGmailMessageId: 'old-gmail', gmailMessageId: 'old-gmail' }, complete: false });
  const result = await ingestTicketAttachmentsFromGmail({ ticket: f.ticket }, f.dependencies);
  assert.deepEqual(f.fetched, ['current-gmail']);
  assert.equal(f.persisted[0].ticketMessageId, 12);
  assert.equal(result.intakeMessageId, 12);
  assert.equal(result.complete, false);
  assert.equal(result.attachmentCompletion.attachmentsIngested, false);
  assert.equal(f.updates.length, 0);
});

test('completion cache is accepted only for both current canonical message and Gmail message', async () => {
  const f = harness({ metadata: { attachmentsIngested: true, attachmentsIngestedMessageId: 12, attachmentsIngestedGmailMessageId: 'current-gmail' } });
  const result = await ingestTicketAttachmentsFromGmail({ ticket: f.ticket }, f.dependencies);
  assert.equal(result.skipped, 'already_ingested');
  assert.equal(result.intakeMessageId, 12);
  assert.equal(result.complete, true);
  assert.equal(f.fetched.length, 0);
  const stale = harness({ metadata: { attachmentsIngested: true, attachmentsIngestedMessageId: 12, attachmentsIngestedGmailMessageId: 'different-gmail' } });
  await ingestTicketAttachmentsFromGmail({ ticket: stale.ticket }, stale.dependencies);
  assert.deepEqual(stale.fetched, ['current-gmail']);
});

test('successful manual inventory returns exact completion binding and guards persistence against a newer inbound', async () => {
  const f = harness();
  const result = await ingestTicketAttachmentsFromGmail({ ticket: f.ticket }, f.dependencies);
  assert.deepEqual(result.attachmentCompletion, { attachmentsIngested: true, attachmentsIngestedMessageId: 12, attachmentsIngestedGmailMessageId: 'current-gmail' });
  assert.equal(result.intakeMessageId, 12);
  assert.deepEqual(f.updates[0].values, [12, 'current-gmail', 7, 12]);
  assert.match(f.updates[0].sql, /AND \?=\(SELECT e.ticket_message_id/);
});

test('multiple legacy inbound messages without provenance remain incomplete instead of reusing original Gmail ID', async () => {
  const f = harness({ latest: null, legacy: [{ id: 4 }, { id: 12 }], metadata: { attachmentsIngested: true, gmailMessageId: 'old-gmail' } });
  const result = await ingestTicketAttachmentsFromGmail({ ticket: f.ticket }, f.dependencies);
  assert.equal(result.complete, false);
  assert.equal(result.skipped, 'inbound_source_ambiguous');
  assert.equal(f.fetched.length, 0);
});

test('exact Gmail-part duplicate repairs only a missing message link without downloading the file again', async () => {
  const hash = createHash('sha256').update('current-gmail:1:packet.pdf').digest('hex');
  const filePath = `uploads/ticket_attachments/ticket_7/gmail-${hash}-packet.pdf`;
  const writes = [];
  const database = { async execute(sql, values = []) {
    if (sql.includes('information_schema')) return [[{ cnt: 1 }]];
    if (sql.startsWith('UPDATE support_ticket_attachments')) { writes.push({ sql, values }); return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected attachment query ${sql}`);
  } };
  const input = { ticketId: 7, ticketMessageId: 12, gmail: {}, gmailMessageId: 'current-gmail', strict: true,
    payload: { parts: [{ partId: '1', filename: 'packet.pdf', mimeType: 'application/pdf', body: { attachmentId: 'remote-file', size: 12 } }] } };
  const result = await persistGmailAttachmentsForTicket(input, { database,
    listTicketAttachments: async () => [{ id: 1, file_path: filePath, file_name: 'packet.pdf', support_ticket_message_id: null }] });
  assert.equal(result.complete, true);
  assert.equal(result.saved, 0);
  assert.deepEqual(writes[0].values, [12, 7, filePath]);
  assert.match(writes[0].sql, /support_ticket_message_id IS NULL/);
  await persistGmailAttachmentsForTicket(input, { database,
    listTicketAttachments: async () => [{ id: 1, file_path: filePath, file_name: 'packet.pdf', support_ticket_message_id: 4 }] });
  assert.equal(writes.length, 1, 'an existing different provenance is never rewritten');
});
