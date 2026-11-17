import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { ticketAssignmentWorkEmail, ticketAssignmentMessage, sendTicketAssignmentEmail } from '../ticketAssignmentEmail.service.js';
test.after(() => pool.end());
const agency = { id: 2, slug: 'itsco', feature_flags: { googleSsoEnabled: true } };
const user = { id: 8, role: 'support', agency_role: 'support', is_active: 1, membership_active: 1, status: 'ACTIVE', email: 'rachel@itsco.health' };
function fixture({ freshOwner = 8, freshStatus = 'open', transportError = false, claimWon = true, result = { id: 'sent-message', communicationId: 91 } } = {}) {
  const calls = [], sends = [], receipts = new Map();
  const claimedAt = new Date('2026-11-17T17:00:00Z');
  const database = { async execute(sql, args = []) {
    calls.push({ sql, args });
    if (sql.includes('u.*,ua.is_active')) return [[{ ...user, ticket_id: 60, ticket_agency_id: 2, claimed_at: claimedAt, claimed_by_user_id: 8, agency_slug: 'itsco', agency_flags: JSON.stringify(agency.feature_flags) }]];
    if (sql.startsWith('SELECT delivery_status')) return [[...(receipts.has(args[0]) ? [{ delivery_status: receipts.get(args[0]).status }] : [])]];
    if (sql.startsWith('INSERT IGNORE')) {
      if (!claimWon || receipts.has(args[3])) return [{ affectedRows: 0 }];
      receipts.set(args[3], { status: 'sending', id: 7 });
      return [{ affectedRows: 1, insertId: 7 }];
    }
    if (sql.startsWith('SELECT claimed_by_user_id')) return [[{ claimed_by_user_id: freshOwner, claimed_at: claimedAt, status: freshStatus }]];
    if (sql.startsWith('UPDATE ticket_assignment_email_deliveries')) {
      for (const record of receipts.values()) record.status = sql.includes("delivery_status='review'") ? 'review' : sql.includes("delivery_status='cancelled'") ? 'cancelled' : args[0];
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql.slice(0, 70)}`);
  } };
  return { calls, sends, dependencies: { database, resolveSender: async () => ({ id: 4, from_email: 'support@itsco.health' }), send: async message => {
    sends.push(message); if (transportError) throw Object.assign(new Error('Uncertain delivery'), { code: 'ETIMEDOUT' }); return result;
  } } };
}
test('assignment emails target active SSO staff and contain a tenant ticket link without ticket contents', () => {
  assert.equal(ticketAssignmentWorkEmail(user, agency), 'rachel@itsco.health');
  for (const patch of [{ is_active: 0 }, { membership_active: 0 }, { is_archived: 1 }, { is_demo: 1 }, { login_is_group_email: 1 }, { sso_password_override: 1 }, { role: 'school_staff' }, { status: 'TERMINATED' }]) {
    assert.equal(ticketAssignmentWorkEmail({ ...user, ...patch }, agency), null);
  }
  assert.equal(ticketAssignmentWorkEmail(user, { ...agency, feature_flags: {} }), null);
  const message = ticketAssignmentMessage(agency, 60);
  assert.equal(message.subject, 'You have a new ticket assigned');
  assert.equal(message.linkUrl, 'https://app.itsco.health/tickets?ticketId=60&agencyId=2');
  assert.match(message.text, /Open your ticket:/);
});
test('one delivery per assignment is claimed before transport and attributed to automation', async () => {
  const f = fixture();
  assert.deepEqual(await sendTicketAssignmentEmail({ ticketId: 60 }, f.dependencies), { sent: true, status: 'sent' });
  assert.equal((await sendTicketAssignmentEmail({ ticketId: 60 }, f.dependencies)).duplicate, true);
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].to, 'rachel@itsco.health');
  assert.equal(f.sends[0].source, 'auto'); assert.equal(f.sends[0].generatedByUserId, null);
  assert.equal(f.sends[0].templateType, 'support_ticket_assigned');
  const claim = f.calls.find(c => c.sql.startsWith('INSERT IGNORE'));
  assert.deepEqual(claim.args.slice(0, 3), [2, 60, 8]);
});
test('competing workers and changed or closed assignments cannot send stale assignment email', async () => {
  for (const options of [{ claimWon: false }, { freshOwner: 9 }, { freshStatus: 'closed' }]) {
    const f = fixture(options); await sendTicketAssignmentEmail({ ticketId: 60 }, f.dependencies);
    assert.equal(f.sends.length, 0);
  }
});
test('uncertain transport is recorded for review without a second send on retry', async () => {
  const f = fixture({ transportError: true });
  await assert.rejects(sendTicketAssignmentEmail({ ticketId: 60 }, f.dependencies), /Uncertain delivery/);
  const retry = await sendTicketAssignmentEmail({ ticketId: 60 }, f.dependencies);
  assert.equal(retry.status, 'review'); assert.equal(f.sends.length, 1);
});
test('assignments before rollout are rejected before delivery lookup or transport', async () => {
  let sends = 0;
  const database = { async execute(sql) {
    assert.match(sql, /JOIN ticket_assignment_email_settings rollout ON rollout.id=1 AND t.claimed_at>=rollout.enabled_at/);
    return [[]];
  } };
  const result = await sendTicketAssignmentEmail({ ticketId: 60 }, { database, send: async () => { sends++; } });
  assert.equal(result.skipped, true); assert.equal(sends, 0);
});
