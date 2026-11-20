import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.SKIP_DB_CONNECT = '1';
const { deliverEmploymentNoticeMail } = await import('../employmentNoticeDelivery.service.js');
const { default: pool } = await import('../../config/database.js');
test.after(() => pool.end());

function setup(approvedAddress) {
  const reviewedAddress = 'personal@example.test';
  const sent = [];
  const seenSql = [];
  const row = {
    notice_id: 7, user_id: 12, delivery_id: 24, personal_email: null,
    subject: 'Private notice', contact_email: 'founders@itsco.health',
    address_digest: createHash('sha256').update(reviewedAddress).digest('hex')
  };
  return {
    sent, seenSql,
    deps: {
      version: 'reviewed-v1', automationIdentity: 'employment-notice@example.test',
      readCampaign: async () => ({ version: 'reviewed-v1', targets: [{ userId: 12, noticeEmail: approvedAddress }] }),
      listAliases: async () => [{ sendAsEmail: 'notifications@itsco.health', verificationStatus: 'accepted' }],
      db: { execute: async sql => {
        seenSql.push(sql);
        return sql.startsWith('SELECT') ? [[row]] : [{ affectedRows: 1 }];
      } },
      getClient: async () => ({ users: { messages: { send: async ({ requestBody }) => {
        sent.push(Buffer.from(requestBody.raw, 'base64url').toString('utf8'));
        return { data: { id: 'mail-receipt' } };
      } } } })
    }
  };
}

test('an approved campaign-only destination delivers without a personal address on the employee profile', async () => {
  const { deps, sent, seenSql } = setup('personal@example.test');
  assert.deepEqual(await deliverEmploymentNoticeMail(deps), { due: 1, accepted: 1, held: 0 });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /To: <personal@example.test>/);
  assert.match(seenSql[0], /UTC_TIMESTAMP\(3\)<n\.link_until/);
  assert(!seenSql.some(sql => /UPDATE users/i.test(sql)));
});

test('a different address from the one staged stays held', async () => {
  const { deps, sent } = setup('changed@example.test');
  assert.deepEqual(await deliverEmploymentNoticeMail(deps), { due: 1, accepted: 0, held: 1 });
  assert.deepEqual(sent, []);
});
