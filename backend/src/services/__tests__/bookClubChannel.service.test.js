import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileBookClubChannel, syncBookClubChannel } from '../bookClubChannel.service.js';

function fakeDb({ subscribed = [7], enabled = true, existing = 81 } = {}) {
  const calls = [];
  const db = {
    calls,
    async execute(sql, args) {
      calls.push([sql, args]);
      if (sql.includes('FROM organization_affiliations')) return [[{ id: 2, name: 'ITSCO Book Club', feature_flags: { bookClubEnabled: enabled } }]];
      if (sql.includes('SELECT id FROM chat_threads')) return [existing ? [{ id: existing }] : []];
      if (sql.includes('INSERT INTO chat_threads')) return [{ insertId: 81 }];
      if (sql.includes('FROM book_club_user_preferences')) return [subscribed.map(user_id => ({ user_id }))];
      return [[]];
    },
    async beginTransaction() { calls.push(['begin']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    release() { calls.push(['release']); }
  };
  return db;
}
test('creates a private channel under the tenant, not under the club', async () => {
  const db = fakeDb({ existing: null });
  assert.deepEqual(await reconcileBookClubChannel(db, 1), { threadId: 81, memberIds: [7] });
  const create = db.calls.find(([sql]) => sql.includes('INSERT INTO chat_threads'));
  assert.match(create[0], /'private'/);
  assert.deepEqual(create[1], [1, 2, 'ITSCO Book Club', 'book_club_subscribers']);
  const eligibility = db.calls.find(([sql]) => sql.includes('FROM book_club_user_preferences'))[0];
  assert.match(eligibility, /interest_status = 'interested'/);
  assert.match(eligibility, /COALESCE\(ua.is_active, 1\) = 1/);
});
test('prunes unsubscribed participants and only adds current subscribers', async () => {
  const db = fakeDb({ subscribed: [7, 9] });
  await reconcileBookClubChannel(db, 1);
  assert.deepEqual(db.calls.find(([sql]) => sql.includes('user_id NOT IN'))[1], [81, 7, 9]);
  assert.deepEqual(db.calls.find(([sql]) => sql.includes('INSERT IGNORE'))[1], [81, 7, 81, 9]);
});
test('disabled club or zero subscribers revokes access without deleting history', async () => {
  for (const options of [{ enabled: false }, { subscribed: [] }]) {
    const db = fakeDb(options);
    await reconcileBookClubChannel(db, 1);
    assert.ok(db.calls.some(([sql, args]) => sql === 'DELETE FROM chat_thread_participants WHERE thread_id = ?' && args[0] === 81));
    assert.ok(!db.calls.some(([sql]) => sql.includes('DELETE FROM chat_messages')));
    assert.ok(!db.calls.some(([sql]) => sql.includes('INSERT IGNORE')));
  }
});
test('subscription and channel access commit together under the tenant lock', async () => {
  const db = fakeDb();
  await syncBookClubChannel({ getConnection: async () => db }, 1, async (conn) => conn.execute('subscription update', [1]));
  const statements = db.calls.map(([sql]) => sql);
  assert.ok(statements.indexOf('SELECT id FROM agencies WHERE id = ? FOR UPDATE') < statements.indexOf('subscription update'));
  assert.equal(statements.at(-2), 'commit');
  assert.equal(statements.at(-1), 'release');
});
test('rolls back the subscription when participant synchronization fails', async () => {
  const db = fakeDb();
  db.execute = async () => { throw new Error('database unavailable'); };
  await assert.rejects(syncBookClubChannel({ getConnection: async () => db }, 1), /database unavailable/);
  assert.deepEqual(db.calls, [['begin'], ['rollback'], ['release']]);
});
