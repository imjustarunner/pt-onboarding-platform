import test from 'node:test';
import assert from 'node:assert/strict';
import { assertInvitedEnrollmentChildren } from '../coGuardianEnrollmentRoster.js';
import { renewInvitedGuardianDraft } from '../coGuardianDraftRenewal.js';
const children = [{ id: 11, full_name: 'Jules Example', date_of_birth: '2015-01-01' }, { id: 12, full_name: 'Riley Example', date_of_birth: '2017-03-14' }];
const payload = children.map(c => ({ clientId: c.id, fullName: c.full_name, dateOfBirth: c.date_of_birth }));
test('accepts all invited siblings and legacy identities without client IDs', () => {
  assert.doesNotThrow(() => assertInvitedEnrollmentChildren(children, payload, [{}, {}]));
  assert.doesNotThrow(() => assertInvitedEnrollmentChildren(children, payload.map(({ clientId, ...c }) => c)));
});
test('rejects additions, missing children, duplicates, and swapped sibling answers', () => {
  for (const rows of [[...payload, payload[0]], [payload[0]], [payload[0], payload[0]], [...payload].reverse()]) {
    assert.throws(() => assertInvitedEnrollmentChildren(children, rows), { status: 400 });
  }
  assert.throws(() => assertInvitedEnrollmentChildren(children, payload, [{}, {}, {}]), { status: 400 });
});
test('a valid client ID does not permit replacing a child or changing their birth date', () => {
  for (const change of [{ clientId: 999 }, { fullName: 'Another Child' }, { dateOfBirth: '2020-01-01' }]) {
    assert.throws(() => assertInvitedEnrollmentChildren(children, [{ ...payload[0], ...change }, payload[1]]), { status: 400 });
  }
});
test('authorized resend renews only its own unfinished draft and returns its saved session', async () => {
  const calls = [], expiresAt = new Date('2030-01-01');
  const db = { execute: async (...args) => { calls.push(args); return args[0].startsWith('SELECT') ? [[{ id: 101, session_token: 'saved-private-session' }]] : [{}]; } };
  assert.equal(await renewInvitedGuardianDraft(db, { invite: { id: 18, public_key: 'form', invited_email: 'parent@example.test' }, recipient: 'PARENT@example.test', expiresAt }), 'saved-private-session');
  assert.deepEqual(calls[0][1], [18, 'form']);
  assert.match(calls[0][0], /submitted_at IS NULL/);
  assert.deepEqual(calls[1][1], [expiresAt, expiresAt, 101, 18]);
  assert.doesNotMatch(calls[1][0], /intake_data|payload_encrypted|status=/);
});
test('a corrected invitation recipient never receives the previous recipient’s saved answers', async () => {
  const calls = [];
  const db = { execute: async (...args) => { calls.push(args); return [{}]; } };
  assert.equal(await renewInvitedGuardianDraft(db, { invite: { id: 18, invited_email: 'old@example.test' }, recipient: 'new@example.test', expiresAt: new Date() }), null);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /SET session_token=NULL/);
  assert.deepEqual(calls[0][1], [18]);
});
test('a first-time invitation has no existing draft to renew', async () => {
  const db = { execute: async () => [[]] };
  assert.equal(await renewInvitedGuardianDraft(db, { invite: { id: 18, public_key: 'form', invited_email: 'parent@example.test' }, recipient: 'parent@example.test', expiresAt: new Date() }), null);
});
