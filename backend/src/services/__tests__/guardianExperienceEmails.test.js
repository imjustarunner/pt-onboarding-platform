import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDemoFamily, assertTestRedirect, demoDeliveryAccepted, demoEmailKey } from '../../scripts/sendGuardianExperienceEmails.mjs';

const guardian = { id: 10, email: 'guardian-test-family@example.com', role: 'client_guardian', is_demo: 1, is_active: 1, status_expires_at: new Date(Date.now() + 86400000) };
const clients = [1, 2, 3].map(id => ({ id, agency_id: id === 2 ? 6 : 2, is_demo: 1, guardian_user_id: 10, access_enabled: 1 }));
const fixture = { run: 'family-20261020', actorId: 4, guardian, clients: clients.map(c => ({ id: c.id, agencyId: c.agency_id })) };

test('email preview accepts only the exact active example.com demo family', () => {
  assert.doesNotThrow(() => assertDemoFamily(fixture, guardian, clients));
  for (const patch of [{ is_demo: 0 }, { is_active: 0 }, { role: 'super_admin' }, { email: 'real@itsco.health' }, { status_expires_at: null }, { status_expires_at: 'invalid' }]) {
    assert.throws(() => assertDemoFamily(fixture, { ...guardian, ...patch }, clients));
  }
  assert.throws(() => assertDemoFamily(fixture, guardian, clients.slice(0, 2)));
  assert.throws(() => assertDemoFamily(fixture, guardian, clients.map((c, i) => i === 1 ? { ...c, is_demo: 0 } : c)));
  assert.throws(() => assertDemoFamily(fixture, guardian, clients.map((c, i) => i === 1 ? { ...c, guardian_user_id: 11 } : c)));
  assert.throws(() => assertDemoFamily(fixture, guardian, clients.map((c, i) => i === 1 ? { ...c, agency_id: 999 } : c)));
});

test('recipient preflight refuses any real address, extra recipient, or absent redirect', () => {
  const valid = { redirected: true, to: 'testing@itsco.health', originalTo: guardian.email, cc: null, bcc: null };
  assert.doesNotThrow(() => assertTestRedirect(valid, guardian.email));
  for (const patch of [{ redirected: false }, { to: guardian.email }, { to: 'testing@itsco.health, someone@real.test' }, { cc: 'someone@real.test' }, { bcc: 'someone@real.test' }, { originalTo: 'other@example.com' }]) {
    assert.throws(() => assertTestRedirect({ ...valid, ...patch }, guardian.email));
  }
});

test('only confirmed redirected submissions count as demo emails sent', () => {
  const valid = { id: 'gmail-message', redirected: true, originalTo: guardian.email };
  assert.equal(demoDeliveryAccepted(valid, guardian.email), true);
  for (const patch of [{ id: null }, { redirected: false }, { originalTo: 'other@example.com' }, { queued: true }, { skipped: true }, { blocked: true }, { pendingApproval: true }]) {
    assert.equal(demoDeliveryAccepted({ ...valid, ...patch }, guardian.email), false);
  }
});

test('stable per-family, recipient, and kind keys cannot collide across preview scopes', () => {
  const key = demoEmailKey('run-1', 10, 'welcome');
  assert.equal(key, demoEmailKey('run-1', 10, 'welcome'));
  assert.notEqual(key, demoEmailKey('run-2', 10, 'welcome'));
  assert.notEqual(key, demoEmailKey('run-1', 11, 'welcome'));
  assert.notEqual(key, demoEmailKey('run-1', 10, 'balance-2'));
});
