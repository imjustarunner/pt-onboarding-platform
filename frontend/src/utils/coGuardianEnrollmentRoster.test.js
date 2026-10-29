import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreInvitedChildren, sameInvitedSigningChildren } from './coGuardianEnrollmentRoster.js';
const first = { id: 11, firstName: 'Jules', lastName: 'Example', dateOfBirth: '2015-01-01' };
const second = { id: 12, firstName: 'Riley', lastName: 'Example', dateOfBirth: '2017-03-14' };
test('a first visit includes every invited child with identifying details', () => {
  const restored = restoreInvitedChildren([first, second]);
  assert.equal(restored.clients.length, 2);
  assert.equal(restored.clients[1].clientId, 12);
  assert.equal(restored.clients[1].dateOfBirth, '2017-03-14');
  assert.deepEqual(restored.answers, [{}, {}]);
});
test('recovers saved answers by child identity even if stored in a different order', () => {
  const restored = restoreInvitedChildren([first, second], [second, first], [{ note: 'second' }, { note: 'first' }]);
  assert.deepEqual(restored.answers, [{ note: 'first' }, { note: 'second' }]);
  assert.deepEqual(restored.excluded, []);
});
test('preserves legacy answers while excluding and retaining accidental extra children privately', () => {
  const extra = { firstName: '', lastName: '' };
  const saved = [{ firstName: 'Jules', lastName: 'Example', dateOfBirth: '2015-01-01' }, extra];
  const answers = [{ note: 'own observations' }, { note: 'saved extra answer' }];
  const restored = restoreInvitedChildren([first], saved, answers);
  assert.equal(restored.clients.length, 1);
  assert.equal(restored.answers[0].note, 'own observations');
  assert.deepEqual(restored.excluded, [{ child: extra, answers: answers[1] }]);
  assert.equal(saved.length, 2);
});
test('removing a wholly blank placeholder preserves signatures; changing a real child does not', () => {
  const child = { fullName: 'Jules Example', dateOfBirth: '2015-01-01' };
  assert.equal(sameInvitedSigningChildren([child, { fullName: '', dateOfBirth: '' }], [child]), true);
  assert.equal(sameInvitedSigningChildren([child, { fullName: 'Another child', dateOfBirth: '' }], [child]), false);
  assert.equal(sameInvitedSigningChildren([child], [{ ...child, dateOfBirth: '2017-01-01' }]), false);
});
