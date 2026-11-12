import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import CommunicationConversation from '../../models/CommunicationConversation.model.js';
import { claimGroupEmailConversation } from '../groupEmailClaim.service.js';
import { resolveTicketInbox } from '../ticketEmailInboxAdapter.service.js';
import { groupEmailConversationSql } from '../groupEmailConversationPolicy.js';
import { isManagedSupportIdentity } from '../supportTicketEmailPolicy.js';
test.after(() => pool.end());

const payroll = { id: 3, kind: 'shared', identity_key: 'payroll', from_email: 'payroll@agency.test' };
const support = { id: 4, kind: 'shared', identity_key: 'support', from_email: 'support@agency.test' };

test('canonical recipient chooses its department instead of the school/support fallback', () => {
  assert.equal(resolveTicketInbox({ source_email_recipients: '["payroll@agency.test"]', topic: 'general' }, [support, payroll]).id, 3);
  assert.equal(resolveTicketInbox({ source_email_recipients: '[]', topic: 'payroll' }, [support, payroll]).id, 3);
});

test('Technology and Compliance retain department ticket routing while People Operations stays outside rollout', () => {
  for (const key of ['technology', 'compliance']) {
    const inbox = { id: 7, agency_id: 2, kind: 'shared', identity_key: key, from_email: `${key}@agency.test`, is_active: 1 };
    assert.equal(isManagedSupportIdentity(inbox, { agencyId: 2 }), true);
    assert.equal(resolveTicketInbox({ source_email_recipients: JSON.stringify([inbox.from_email]), topic: 'general' }, [support, inbox]).id, 7);
  }
  assert.equal(isManagedSupportIdentity({ agency_id: 2, identity_key: 'po', from_email: 'po@agency.test', is_active: 1 }, { agencyId: 2 }), false);
});

test('group queue predicates preserve mailbox-less calls, sanitize ids, and exclude unpermitted departments', () => {
  const sql = groupEmailConversationSql({ groupInboxIds: [3, 4, '4 OR 1=1'], allowedGroupInboxIds: [3, 900] });
  assert.match(sql.access, /COALESCE\(c.inbox_id,0\) IN \(3,4\)/);
  assert.match(sql.allowedGroup, /IN \(3\)/);
  assert.doesNotMatch(sql.access, /900|4 OR/);
  assert.match(sql.sharedQueue, /t.claimed_by_user_id IS NULL/);
  assert.match(sql.unread, /group_reply.send_status='sent'/);
});

function claimFixture({ claimedBy = null, affectedRows = 1, deny = false } = {}) {
  const calls = [];
  const db = {
    async beginTransaction() { calls.push('begin'); }, async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); }, release() { calls.push('release'); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT')) return [[{ ...payroll, id: 22, agency_id: 2, support_ticket_id: 11, status: 'open', claimed_by_user_id: claimedBy }]];
      return [{ affectedRows }];
    }
  };
  return { calls, dependencies: { database: { getConnection: async () => db }, assertAccess: async ({ groupKey, db: client }) => {
    assert.equal(groupKey, 'payroll'); assert.equal(client, db);
    if (deny) throw Object.assign(new Error('denied'), { status: 403 });
  } } };
}

test('claim atomically updates the canonical ticket before its conversation and does not mark personal reads', async () => {
  const f = claimFixture();
  const result = await claimGroupEmailConversation({ conversationId: 22, userId: 8 }, f.dependencies);
  assert.equal(result.ticketId, 11);
  const updates = f.calls.filter(c => c.sql?.startsWith('UPDATE'));
  assert.match(updates[0].sql, /support_tickets.*claimed_by_user_id/s);
  assert.match(updates[0].sql, /claimed_by_user_id IS NULL/);
  assert.match(updates[1].sql, /communication_conversations/);
  assert.deepEqual(f.calls.slice(-2), ['commit', 'release']);
  assert.equal(f.calls.some(c => c.sql?.includes('conversation_reads')), false);
});

test('claim rejects races and existing owners without changing the conversation', async () => {
  for (const options of [{ claimedBy: 9 }, { affectedRows: 0 }, { deny: true }]) {
    const f = claimFixture(options);
    await assert.rejects(claimGroupEmailConversation({ conversationId: 22, userId: 8 }, f.dependencies));
    assert.equal(f.calls.some(c => c.sql?.startsWith('UPDATE communication_conversations')), false);
    assert.deepEqual(f.calls.slice(-2), ['rollback', 'release']);
  }
});

test('list and badge queries share group privacy, unread, and canonical assignment rules', async () => {
  const original = pool.execute;
  const queries = [];
  pool.execute = async (sql, params) => {
    queries.push(sql);
    const withoutStrings = sql.replace(/'[^']*'/g, "''");
    assert.equal((withoutStrings.match(/\?/g) || []).length, params.length, 'every placeholder is bound');
    let depth = 0;
    for (const c of withoutStrings) { if (c === '(') depth++; if (c === ')') depth--; assert.ok(depth >= 0, 'SQL parentheses remain balanced'); }
    assert.equal(depth, 0);
    return sql.includes('COUNT(*)') ? [[{ n: 0 }]] : [[{ id: 22, inbox_id: 3, support_ticket_id: 11, last_inbound_at: new Date(), last_read_at: null }]];
  };
  try {
    const options = { agencyId: 2, userId: 8, scopeToUserId: 8, groupInboxIds: [3,4], allowedGroupInboxIds: [3] };
    const rows = await CommunicationConversation.list({ ...options, filter: 'unread' });
    assert.equal(rows[0].is_unread, true);
    await CommunicationConversation.attentionSummary(options);
    for (const sql of queries) { assert.match(sql, /LEFT JOIN support_tickets t/); assert.match(sql, /COALESCE\(c.inbox_id,0\) IN \(3,4\)/); }
  } finally { pool.execute = original; }
});

test('group members can follow claimed tickets while Assigned retains the claimant scope', async () => {
  const original = pool.execute;
  let latestQuery;
  pool.execute = async (sql) => { latestQuery = sql; return [[]]; };
  try {
    const options = { agencyId: 2, userId: 8, groupOnly: true, groupInboxIds: [3], allowedGroupInboxIds: [3] };
    for (const filter of ['all', 'unread', 'sent', 'waiting', 'drafts', 'draft']) {
      await CommunicationConversation.list({ ...options, filter });
      const where = latestQuery.slice(latestQuery.indexOf('WHERE c.archived_at'));
      assert.doesNotMatch(where, /t.claimed_by_user_id IS NULL/, `${filter} must preserve shared visibility after claiming`);
    }
    await CommunicationConversation.list({ ...options, groupOnly: false, filter: 'assigned' });
    const assignedWhere = latestQuery.slice(latestQuery.indexOf('WHERE c.archived_at'));
    assert.doesNotMatch(assignedWhere, /t.claimed_by_user_id IS NULL/);
    assert.match(assignedWhere, /THEN t.claimed_by_user_id ELSE c.owner_user_id END\) = \?/);
  } finally { pool.execute = original; }
});
