import test from 'node:test';
import assert from 'node:assert/strict';
import { integrationDefaults, cleanPlatformSettings, publicPlatformSettings, requirePlatformSuperadmin, assertVideoWindow, smsScope, normalizeSessionPhone } from './integrationPolicy.js';
import { notifyreRequest, notifyreNumbers } from './sessionTransports.js';

test('only MFA-verified platform operators can change services', () => {
  for (const ctx of [{}, { profile: { operator: false }, verified: true, permissions: ['admin'] }, { profile: { operator: true }, verified: false }])
    assert.throws(() => requirePlatformSuperadmin(ctx), { status: 403 });
  assert.doesNotThrow(() => requirePlatformSuperadmin({ profile: { operator: true }, verified: true }));
});
test('new platform defaults disable permanent offices and SMS, with scheduled Meet enabled', () => {
  const s = integrationDefaults();
  assert.equal(s.alwaysAvailableOffice, false); assert.equal(s.smsProvider, 'disabled'); assert.equal(s.videoProvider, 'google_meet');
});
test('API tokens stay private, blank preserves them, and changing the sender invalidates verification', () => {
  const s = integrationDefaults();
  s.notifyre = { apiToken: 'secret-test-only', from: '+17195550123', campaignId: 'patient-1', baaReference: 'signed', verifiedAt: 'today' };
  const redacted = publicPlatformSettings(s);
  assert.equal(redacted.notifyre.apiToken, undefined); assert.equal(redacted.notifyre.hasApiToken, true);
  const unchanged = cleanPlatformSettings(redacted, s);
  assert.equal(unchanged.notifyre.apiToken, 'secret-test-only'); assert.equal(unchanged.notifyre.verifiedAt, 'today');
  const changed = cleanPlatformSettings({ ...redacted, notifyre: { ...redacted.notifyre, from: '+17195550124' } }, s);
  assert.equal(changed.notifyre.verifiedAt, null);
  assert.throws(() => cleanPlatformSettings({ ...redacted, smsProvider: 'notifyre', notifyre: { ...redacted.notifyre, from: '+17195550124' } }, s), { status: 409 });
});
test('consent scope follows provider, campaign and sender; switches cannot carry consent silently', () => {
  const s = integrationDefaults(); s.smsProvider = 'notifyre'; s.notifyre.campaignId = 'one'; s.notifyre.from = '+17195550123';
  const scope = smsScope(s);
  assert.notEqual(scope, smsScope({ ...s, smsProvider: 'vonage' }));
  assert.notEqual(scope, smsScope({ ...s, notifyre: { ...s.notifyre, from: '+17195550124' } }));
  assert.equal(normalizeSessionPhone('(719) 555-0123'), '+17195550123');
});
test('cancelled, completed, wrong-modality and out-of-window appointments cannot join', () => {
  const now = Date.now();
  const a = { data: { modality: 'video', status: 'scheduled', start: new Date(now).toISOString(), end: new Date(now + 3600000).toISOString() } };
  assert.doesNotThrow(() => assertVideoWindow(a, now));
  for (const status of ['cancelled', 'no_show', 'completed']) assert.throws(() => assertVideoWindow({ data: { ...a.data, status } }, now), { status: 409 });
  assert.throws(() => assertVideoWindow({ data: { ...a.data, modality: 'office' } }, now), { status: 409 });
  assert.throws(() => assertVideoWindow(a, now - 16 * 60000), { status: 409 });
  assert.throws(() => assertVideoWindow(a, now + 91 * 60000), { status: 409 });
});
test('Notifyre transport uses its documented token header and rejects provider failure without leaking credentials', async () => {
  let request;
  const result = await notifyreRequest('test-secret', '/sms/send', { Body: 'Test' }, async (url, options) => {
    request = { url, options }; return { ok: true, json: async () => ({ Success: true, Payload: { ID: 'abc' } }) };
  });
  assert.equal(result.ID, 'abc'); assert.equal(request.url, 'https://api.notifyre.com/sms/send');
  assert.equal(request.options.headers['x-api-token'], 'test-secret'); assert.equal(request.options.redirect, 'error');
  await assert.rejects(() => notifyreRequest('test-secret', '/sms/send', {}, async () => ({ ok: true, json: async () => ({ Success: false, Message: 'test-secret' }) })), e => e.status === 503 && !e.message.includes('test-secret'));
  assert.deepEqual(notifyreNumbers([{ Number: '17195550123' }]), ['+17195550123']);
});
