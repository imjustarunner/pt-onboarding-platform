import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.SKIP_DB_CONNECT = '1';
process.env.EMPLOYMENT_NOTICE_ENABLED = 'true';
const { ACKNOWLEDGMENT, assertEmploymentNoticeAccess, acknowledgeEmploymentNotice, getEmploymentNotice, issueSignInNoticeKey } = await import('../employmentNotice.service.js');

const { default: pool } = await import('../../config/database.js');
test.after(() => pool.end());

const row = {
  id: 50, user_id: 9, channel: 'personal_email', version: 'v1', subject: 'Notice',
  letter: 'Full notice', contact_email: 'founders@example.test', acknowledged_at: null,
  restriction_pending: 1
};

test('only a matched session gets a notice gate, and old sessions must sign in again afterward', async () => {
  const oldSession = { id: 9, iat: 1000 };
  const nobody = { execute: async () => [[undefined]] };
  await assertEmploymentNoticeAccess({ id: 999 }, { db: nobody });

  for (const restricted of [1, 0]) {
    const db = { execute: async (_, params) => {
      assert.deepEqual(params, [9, null, 1000]);
      return [[{ ...row, restricted }]];
    } };
    await assert.rejects(assertEmploymentNoticeAccess(oldSession, { existingSession: true, db }), {
      code: restricted ? 'EMPLOYMENT_NOTICE_REQUIRED' : 'SESSION_EXPIRED'
    });
  }
});

test('a sign-in key is random, stored by digest, and scoped to the recipient', async () => {
  let params;
  const db = { execute: async (_, values) => { params = values; return [{ affectedRows: 1 }]; } };
  const key = await issueSignInNoticeKey({ noticeId: 50, userId: 9 }, db);
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(params, [createHash('sha256').update(key).digest(), 50, 9]);
});

test('acknowledgment requires a valid key, matching version, and explicit receipt', async () => {
  const key = 'x'.repeat(43);
  const time = new Date();
  let receiptWritten = false;
  const db = { execute: async (sql, params) => {
    if (sql.startsWith('INSERT')) {
      assert.deepEqual(params, [ACKNOWLEDGMENT, createHash('sha256').update(key).digest(), 'v1']);
      assert.match(sql, /ON DUPLICATE KEY UPDATE/);
      receiptWritten = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT acknowledged_at')) return [[{ acknowledged_at: time }]];
    return [[row]];
  } };
  assert.equal(await getEmploymentNotice('too-short', db), null);
  await assert.rejects(acknowledgeEmploymentNotice({ key, version: 'v1', acknowledged: false }, db), { status: 400 });
  assert.equal(await acknowledgeEmploymentNotice({ key, version: 'stale', acknowledged: true }, db), null);
  assert.equal(receiptWritten, false);
  assert.deepEqual(await acknowledgeEmploymentNotice({ key, version: 'v1', acknowledged: true }, db), { acknowledgedAt: time });
  assert.equal(receiptWritten, true);
});
