import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { decryptTicketMessageRow } from '../../utils/supportTicketCrypto.js';
import { closeTicketWithoutReply } from '../closeTicketWithoutReply.service.js';
test.after(() => pool.end());
function fixture({ closed = false, auditFailure = false } = {}) {
  const calls = [];
  const db = { async beginTransaction() { calls.push('begin'); }, async commit() { calls.push('commit'); }, async rollback() { calls.push('rollback'); }, release() { calls.push('release'); },
    async execute(sql, args) {
      calls.push({ sql, args });
      if (sql.startsWith('SELECT id,status')) return [[{ id: 7, status: closed ? 'closed' : 'open' }]];
      if (sql.startsWith('SELECT MAX')) return [[{ id: 10 }]];
      if (auditFailure && sql.startsWith('INSERT')) throw new Error('Audit unavailable');
      return [{ affectedRows: 1 }];
    } };
  return { calls, database: { getConnection: async () => db } };
}
const input = { ticket: { id: 7, agency_id: 2, source_channel: 'email' }, user: { id: 9, role: 'support' }, expectedLastMessageId: 10 };
test('no-reply closure records the clicked actor and encrypted reason in the same transaction, with no outbound delivery', async () => {
  const old = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 4).toString('base64');
  try {
    const f = fixture(); await closeTicketWithoutReply(input, f.database);
    const insert = f.calls.find(call => call.sql?.startsWith('INSERT'));
    assert.deepEqual(insert.args.slice(0, 3), [7, 9, 'support']); assert.equal(insert.args[3], null);
    const row = decryptTicketMessageRow({ body: insert.args[3], body_ciphertext: insert.args[4], body_iv: insert.args[5], body_auth_tag: insert.args[6], encryption_key_id: insert.args[7] });
    assert.equal(row.body, 'Ticket closed: no reply needed. No email was sent.');
    assert.deepEqual(f.calls.slice(-2), ['commit', 'release']);
    assert.equal(f.calls.some(call => call.sql?.includes('support_ticket_email_messages')), false);
    const closed = fixture({ closed: true }); await closeTicketWithoutReply(input, closed.database);
    assert.equal(closed.calls.some(call => call.sql?.startsWith('INSERT')), false);
  } finally { if (old == null) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = old; }
});
test('a new inbound message or an audit failure prevents committing the closure', async () => {
  const old = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 4).toString('base64');
  try {
    const stale = fixture(); await assert.rejects(closeTicketWithoutReply({ ...input, expectedLastMessageId: 9 }, stale.database), /new message arrived/);
    assert.equal(stale.calls.some(call => call.sql?.startsWith('UPDATE')), false);
    const broken = fixture({ auditFailure: true }); await assert.rejects(closeTicketWithoutReply(input, broken.database), /Audit unavailable/);
    assert.equal(broken.calls.includes('commit'), false); assert.deepEqual(broken.calls.slice(-2), ['rollback', 'release']);
  } finally { if (old == null) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = old; }
});
