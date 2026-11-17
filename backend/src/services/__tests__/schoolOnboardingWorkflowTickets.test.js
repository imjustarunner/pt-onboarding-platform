import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { syncSchoolOnboardingWorkflowTicket } from '../schoolOnboardingWorkflowTickets.service.js';
test.after(() => pool.end());
function fixture({ slug = 'itsco', contactEmail = 'school@example.test', owners = [{ id: 8 }] } = {}) {
  const calls = [], sent = []; let link = null;
  const connection = {
    async beginTransaction() { calls.push('begin'); }, async commit() { calls.push('commit'); }, async rollback() { calls.push('rollback'); }, release() { calls.push('release'); },
    async execute(sql, args) {
      calls.push({ sql, args });
      assert.equal((sql.match(/\?/g) || []).length, args.length, 'all SQL placeholders are bound');
      if (sql.startsWith('SELECT i.*')) return [[{ id: 18, agency_id: 2, agency_slug: slug, contact_email: contactEmail, school_organization_id: 11, school_name: 'Example School' }]];
      if (sql.startsWith('SELECT u.id')) return [owners];
      if (sql.startsWith('SELECT ticket_id')) return [[...(link ? [link] : [])]];
      if (sql.startsWith('INSERT INTO support_tickets')) return [{ insertId: 60 }];
      if (sql.startsWith('INSERT INTO school_onboarding_workflow_tickets')) link = { ticket_id: args[1], stage_key: args[2] };
      if (sql.startsWith('UPDATE school_onboarding_workflow_tickets')) link.stage_key = args[1];
      return [{ affectedRows: 1 }];
    }
  };
  return { calls, sent, dependencies: { database: { getConnection: async () => connection }, sendAssignment: async ({ ticketId }) => { sent.push(ticketId); return { sent: true }; } } };
}
test('invites, reminders and completion share one Rachel-owned ticket with explicit automation events', async () => {
  const f = fixture();
  for (const [stage, stageKey] of [['invite','invite:5'],['reminder','reminder:6'],['completed','completed']]) {
    const result = await syncSchoolOnboardingWorkflowTicket({ inviteId: 18, stage, stageKey }, f.dependencies);
    assert.equal(result.ticketId, 60);
  }
  const creation = f.calls.filter(c => c.sql?.startsWith('INSERT INTO support_tickets'));
  assert.equal(creation.length, 1); assert.equal(creation[0].args.at(-1), 8);
  assert.match(creation[0].sql, /NULL,'school_onboarding_workflow'/);
  const updates = f.calls.filter(c => c.sql?.startsWith('UPDATE support_tickets'));
  assert.equal(updates.length, 2); assert.match(updates[0].sql, /COALESCE\(claimed_by_user_id,\?\)/);
  const notes = f.calls.filter(c => c.sql?.startsWith('INSERT INTO support_ticket_messages'));
  assert.equal(notes.length, 3); assert.match(notes[0].sql, /NULL,'system'/);
  assert.equal((await syncSchoolOnboardingWorkflowTicket({ inviteId: 18, stage: 'completed', stageKey: 'completed' }, f.dependencies)).duplicate, true);
  assert.equal(f.calls.filter(c => c.sql?.startsWith('INSERT INTO support_ticket_messages')).length, 3);
});
test('other tenants and missing or ambiguous Rachel membership cannot create or assign tickets', async () => {
  const other = fixture({ slug: 'another-agency' });
  assert.equal((await syncSchoolOnboardingWorkflowTicket({ inviteId: 18, stage: 'invite' }, other.dependencies)).skipped, true);
  assert.equal(other.sent.length, 0);
  for (const owners of [[], [{ id: 8 }, { id: 9 }]]) {
    const f = fixture({ owners });
    await assert.rejects(syncSchoolOnboardingWorkflowTicket({ inviteId: 18, stage: 'invite' }, f.dependencies), { code: 'SCHOOL_ONBOARDING_ASSIGNEE_UNAVAILABLE' });
    assert.equal(f.calls.some(c => c.sql?.startsWith('INSERT')), false);
    assert.equal(f.calls.includes('rollback'), true); assert.equal(f.sent.length, 0);
  }
});

test('testing mailbox onboarding never creates app work or assignment email', async () => {
 const f = fixture({ contactEmail:'testing+school@itsco.health' });
 assert.equal((await syncSchoolOnboardingWorkflowTicket({inviteId:18,stage:'invite'},f.dependencies)).skipped,true);
 assert.equal(f.sent.length,0);assert.equal(f.calls.some(c=>c.sql?.startsWith('INSERT')),false);
});
