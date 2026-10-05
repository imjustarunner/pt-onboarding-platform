import test from 'node:test';
import assert from 'node:assert/strict';
import { requestFields, transitionRequest } from './policy.js';
const valid = { requesterName: 'Parent', patientName: 'Child', email: 'parent@example.invalid', phone: '555-0100', relationship: 'parent', scope: 'All records', attested: true };
test('submission requires attestation and rejects arbitrary relationships and invalid contact', () => {
  assert.equal(requestFields(valid).relationship, 'parent');
  for (const change of [{ attested: false }, { relationship: 'staff' }, { email: 'bad' }, { scope: 'x'.repeat(2001) }])
    assert.throws(() => requestFields({ ...valid, ...change }), { status: 400 });
  assert.equal(requestFields({ ...valid, status: 'approved', identityMethod: 'in_person' }).status, undefined);
});
test('public request cannot skip verification or use submitted email as identity proof', () => {
  const prior = { status: 'pending_verification' };
  assert.throws(() => transitionRequest(prior, { status: 'approved' }, 'staff'), { status: 409 });
  assert.throws(() => transitionRequest(prior, { status: 'pending_review', identityConfirmed: true, identityMethod: 'submitted_email' }, 'staff'), { status: 400 });
});
test('identity, representative authority, and secure delivery are separate gates', () => {
  const verified = transitionRequest({ status: 'pending_verification' }, { status: 'pending_review', identityMethod: 'on_file_callback', identityConfirmed: true, response: 'Identity checked' }, 'staff');
  assert.throws(() => transitionRequest(verified, { status: 'approved', response: 'Ready' }, 'staff'), { status: 400 });
  const approved = transitionRequest(verified, { status: 'approved', authorityConfirmed: true, response: 'Approved' }, 'staff');
  assert.throws(() => transitionRequest(approved, { status: 'fulfilled', response: 'Complete' }, 'staff'), { status: 400 });
  const fulfilled = transitionRequest(approved, { status: 'fulfilled', deliveryReference: 'Chart delivery log entry', response: 'Delivered' }, 'staff');
  assert.equal(fulfilled.history.length, 3);
  assert.equal(fulfilled.authorityReviewedBy, 'staff');
  assert.throws(() => transitionRequest(fulfilled, { status: 'approved' }, 'staff'), { status: 409 });
});
test('portal authentication still requires authority review and closure requires explanation', () => {
  const prior = { status: 'pending_review', identityMethod: 'authenticated_portal' };
  assert.throws(() => transitionRequest(prior, { status: 'approved', authorityConfirmed: false }, 'staff'), { status: 400 });
  assert.throws(() => transitionRequest(prior, { status: 'closed', response: '' }, 'staff'), { status: 400 });
});
