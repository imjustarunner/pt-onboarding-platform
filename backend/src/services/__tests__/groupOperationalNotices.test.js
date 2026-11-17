import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { captureGroupOperationalNotice } from '../groupOperationalNotices.service.js';
test.after(() => pool.end());
test('system packets use the idempotent message receipt with their complete content and attachments', async () => {
  const saved = [], attachment = { filename: 'packet.pdf', storageKey: 'fixture/packet.pdf' };
  const input = { identity: { id: 3, agency_id: 2, kind: 'shared', identity_key: 'schoolreply' },
    fromEmail: 'notifications@agency.test', subject: 'Paper Enrollment Packet submitted', messageId: '<notice@agency.test>', threadId: 'thread', to: ['schools@agency.test'] };
  const dependencies = { database: { execute: async () => [[{ id: 1 }]] },
    inboxes: { ensureFromSenderIdentities: async () => {}, listForAgency: async () => [{ id: 7, sender_identity_id: 3 }] },
    prepareAttachments: async () => [attachment], readHtml: async () => '<p>Full notice</p>',
    persist: async value => { saved.push(value); return { ingested: true, conversationId: 9 }; } };
  const result = await captureGroupOperationalNotice(input, dependencies);
  assert.equal(result.category, 'enrollment_packets');
  assert.equal(saved[0].inboxId, 7); assert.equal(saved[0].ownerUserId, null);
  assert.deepEqual(saved[0].attachments, [attachment]); assert.equal(saved[0].bodyHtml, '<p>Full notice</p>');
  assert.equal(saved[0].deliveryId, input.messageId);
});
test('ordinary replies and unrecognized senders continue through normal intake', async () => {
  const base = { identity: { id: 3, agency_id: 2, kind: 'shared', identity_key: 'schoolreply' }, subject: 'Paper Enrollment Packet submitted', messageId: '<n@agency.test>' };
  let queried = 0;
  const database = { execute: async () => { queried++; return [[]]; } };
  assert.equal((await captureGroupOperationalNotice({ ...base, subject: 'Re: Paper Enrollment Packet submitted' }, { database })).ingested, false);
  assert.equal(queried, 0);
  assert.equal((await captureGroupOperationalNotice(base, { database })).ingested, false);
});
test('an attachment failure leaves the receipt unacknowledged for a complete retry', async () => {
  let persisted = false;
  await assert.rejects(captureGroupOperationalNotice({ identity: { id: 3, agency_id: 2, identity_key: 'schoolreply' }, subject: 'Digital Enrollment Packet submitted', messageId: 'id' }, {
    database: { execute: async () => [[{ id: 1 }]] }, inboxes: { ensureFromSenderIdentities: async () => {}, listForAgency: async () => [{ id: 7, sender_identity_id: 3 }] },
    prepareAttachments: async () => { throw new Error('Attachment unavailable'); }, persist: async () => { persisted = true; }
  }), /Attachment unavailable/);
  assert.equal(persisted, false);
});
