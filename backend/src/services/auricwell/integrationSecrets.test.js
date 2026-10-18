import test from 'node:test';
import assert from 'node:assert/strict';
import { integrationDefaults, publicPlatformSettings } from './integrationPolicy.js';
import { runtimeIntegrationSecrets, storedIntegrationSecrets, assertManagedSecretsUnchanged } from './integrationSecrets.js';
const env = { AURICWELL_NOTIFYRE_API_TOKEN: 'test-token-only', AURICWELL_NOTIFYRE_WEBHOOK_SECRET: 'test-signature-only' };
test('runtime credentials stay out of database payloads and browser responses', () => {
  const effective = runtimeIntegrationSecrets(integrationDefaults(), env);
  assert.equal(effective.notifyre.apiToken, env.AURICWELL_NOTIFYRE_API_TOKEN);
  assert.equal(effective.notifyre.apiTokenManaged, true);
  const stored = storedIntegrationSecrets(effective, env);
  const publicValue = publicPlatformSettings(effective);
  for (const value of [JSON.stringify(stored), JSON.stringify(publicValue)]) {
    assert.ok(!value.includes('test-token-only')); assert.ok(!value.includes('test-signature-only'));
  }
  assert.equal(publicValue.notifyre.apiTokenFingerprint, undefined);
  assert.equal(publicValue.notifyre.hasApiToken, true);
  assert.equal(stored.notifyre.apiTokenManaged, undefined);
});
test('token rotation disables verified Notifyre routes; unchanged credentials retain verification', () => {
  let s = runtimeIntegrationSecrets(integrationDefaults(), env);
  s.notifyre.webhookVerifiedAt = 'verified';
  s.clientMessaging.routes = [{ enabled:true, verifiedAt:'verified', verifiedProvider:'notifyre' }];
  const stored = storedIntegrationSecrets(s, env);
  assert.equal(runtimeIntegrationSecrets(stored, env).notifyre.webhookVerifiedAt, 'verified');
  const rotated = runtimeIntegrationSecrets(stored, { ...env, AURICWELL_NOTIFYRE_API_TOKEN:'rotated' });
  assert.equal(rotated.notifyre.webhookVerifiedAt, null);
  assert.equal(rotated.clientMessaging.routes[0].enabled, false);
  assert.equal(rotated.clientMessaging.routes[0].verifiedAt, null);
  const removed = runtimeIntegrationSecrets(stored, {});
  assert.equal(removed.notifyre.apiToken, '');
  assert.equal(removed.clientMessaging.routes[0].enabled, false);
});
test('webhook rotation requires a fresh signed callback without invalidating account ownership', () => {
  let s = runtimeIntegrationSecrets(integrationDefaults(), env);
  s.notifyre.webhookVerifiedAt = 'verified';
  s.clientMessaging.routes = [{ enabled:true, verifiedAt:'verified', verifiedProvider:'notifyre' }];
  const next = runtimeIntegrationSecrets(storedIntegrationSecrets(s,env), {...env, AURICWELL_NOTIFYRE_WEBHOOK_SECRET:'new-signature'});
  assert.equal(next.notifyre.webhookVerifiedAt,null);
  assert.equal(next.clientMessaging.routes[0].verifiedAt,'verified');
});
test('app settings cannot replace or remove externally managed secrets', () => {
  for (const change of [{apiToken:'new'}, {removeToken:true}, {webhookSecret:'new'}, {removeWebhookSecret:true}])
    assert.throws(()=>assertManagedSecretsUnchanged({notifyre:change},env),{status:409});
  assert.doesNotThrow(()=>assertManagedSecretsUnchanged({notifyre:{apiToken:'',webhookSecret:''}},env));
  const stored = storedIntegrationSecrets({...integrationDefaults(),notifyre:{apiToken:'local-token',webhookSecret:'local-secret'}},{});
  assert.equal(stored.notifyre.apiToken,'local-token');
});
