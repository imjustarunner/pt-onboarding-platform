import test from 'node:test';
import assert from 'node:assert/strict';
import { messageInboxPolicySql, operationalNoticeCategory, chatInboxVisibilitySql } from '../messageInboxPolicy.js';
import { applySchoolGmailOwnership, authenticatedSchoolStaffReply, googleAuthenticationResults } from '../schoolGmailOwnership.service.js';
import { notificationInboxVisibilitySql } from '../notificationInboxPolicy.js';
import { departmentalGroupKeysForUser, groupKeyForIdentity } from '../departmentalGroupPolicy.js';

test('classifies actual packet/assignment subjects while leaving replies as correspondence', () => {
  assert.equal(operationalNoticeCategory('Example School — Provider assignment: ABCDEF'), 'provider_assignments');
  for (const mode of ['Digital', 'Paper']) assert.equal(operationalNoticeCategory(`${mode} Enrollment Packet submitted`), 'enrollment_packets');
  assert.equal(operationalNoticeCategory('Re: Digital Enrollment Packet submitted'), null);
  assert.equal(operationalNoticeCategory('Question about assignments'), null);
  assert.equal(operationalNoticeCategory('Example School - Clinician assigned'), 'provider_assignments');
});
test('the same historical classification preserves human replies, filters QA evidence, and scopes Rachel to schools', () => {
  const policy = messageInboxPolicySql({ userId: 9, schoolGroupInboxIds: [7, '8 OR 1=1'] });
  assert.match(policy.category, /WHEN .*?human|pm.in_reply_to IS NOT NULL/s);
  assert.match(policy.category, /pu.agency_id=c.agency_id/);
  assert.match(policy.category, /created_via_dev_fill/);
  assert.match(policy.category, /client_exchange_demo_audit/);
  assert.match(policy.demo, /qe.from_name/);
  assert.match(policy.schoolAutoRead, /IN \(7\)/); assert.doesNotMatch(policy.schoolAutoRead, /8 OR/);
  assert.match(policy.schoolAutoRead, /pr.id=9/); assert.match(policy.schoolAutoRead, /pra.agency_id=c.agency_id/);
  assert.match(policy.schoolAutoRead, /rachel@itsco.health/);
});
test('school identities are groups and billing remains an explicit agency grant', () => {
  assert.equal(groupKeyForIdentity({ kind: 'shared', identity_key: 'schoolreply' }), 'schools');
  assert.equal(groupKeyForIdentity({ kind: 'personal', identity_key: 'schools' }), null);
  const user = { role: 'admin', is_active: 1, membership_active: 1, status: 'ACTIVE' };
  assert.equal(departmentalGroupKeysForUser(user).includes('billing'), false);
  assert.equal(departmentalGroupKeysForUser({ ...user, has_billing_access: 1 }).includes('billing'), true);
  assert.match(chatInboxVisibilitySql(9), /ba.agency_id=t.agency_id/);
});
test('packet notices and duplicate delivered email are excluded without deleting old notifications', () => {
  const sql = notificationInboxVisibilitySql('n');
  assert.match(sql, /type<>'new_packet_uploaded'/); assert.match(sql, /type<>'school_group_email_received'/); assert.match(sql, /delivery_status IN \('sent','delivered'\)/);
  assert.match(sql, /ne.client_id=n.related_entity_id/); assert.doesNotMatch(sql, /DELETE|UPDATE/);
  assert.throws(() => notificationInboxVisibilitySql('n; DROP TABLE users'));
});
const reply = { fromEmail: 'rachel@itsco.health', staffUserId: 9, inReplyTo: '<source@school.test>', authenticationResults: 'mx.google.com; dmarc=pass header.from=itsco.health' };
test('only aligned Gmail evidence qualifies for automatic ownership', () => {
  assert.equal(authenticatedSchoolStaffReply(reply), true);
  assert.equal(authenticatedSchoolStaffReply({ authenticationResults: 'dmarc=fail header.from=itsco.health' }), false);
  assert.equal(authenticatedSchoolStaffReply({ authenticationResults: 'dkim=pass header.d=attacker.example' }), false);
  assert.equal(authenticatedSchoolStaffReply({ authenticationResults: 'mx.google.com; dkim=pass header.d=itsco.health.attacker.example' }), false);
  assert.equal(authenticatedSchoolStaffReply({ authenticationResults: 'attacker.example; dmarc=pass header.from=itsco.health' }), false);
  const evidence = googleAuthenticationResults([{ name: 'Authentication-Results', value: 'mx.google.com; dmarc=fail header.from=itsco.health' }, { name: 'authentication-results', value: reply.authenticationResults }]);
  assert.equal(authenticatedSchoolStaffReply({ authenticationResults: evidence }), false);
});
test('verified Gmail reply claims an unowned ticket and attributes the automation separately', async () => {
  const statements = [];
  const database = { async execute(sql, args) { statements.push({ sql, args }); return sql.startsWith('SELECT') ? [[{ id: 9 }]] : [{ affectedRows: 1 }]; } };
  const result = await applySchoolGmailOwnership({ input: reply, ticket: { id: 7, agency_id: 2, school_organization_id: 20 }, database });
  assert.equal(result, true); assert.match(statements[1].sql, /claimed_by_user_id IS NULL/);
  assert.match(statements[2].sql, /NULL,'system'/); assert.equal(statements[2].args[0], 7);
});
test('does not take another staff claim, reassign an app receipt, or trust an unverified From', async () => {
  for (const option of [{ input: { ...reply, authenticationResults: '' } }, { appOriginReceipt: true }, { input: { ...reply, fromEmail: 'someone@itsco.health' } }]) {
    let calls = 0;
    assert.equal(await applySchoolGmailOwnership({ input: reply, ticket: { id: 7, agency_id: 2, school_organization_id: 20 }, database: { execute: async () => { calls++; throw new Error('Unexpected write'); } }, ...option }), false);
    assert.equal(calls, 0);
  }
  const calls = [];
  assert.equal(await applySchoolGmailOwnership({ input: reply, ticket: { id: 7, agency_id: 2, school_organization_id: 20 }, database: { async execute(sql) { calls.push(sql); return sql.startsWith('SELECT') ? [[{ id: 9 }]] : [{ affectedRows: 0 }]; } } }), false);
  assert.equal(calls.length, 2);
});
