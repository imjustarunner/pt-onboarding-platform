import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionMfaSecret, MFA_ENV } from './provision-mfa-secret.mjs';
const key = Buffer.alloc(32, 7).toString('base64');
function fixture({ entry, exists = true, value = key, state = 'ENABLED' } = {}) {
  const calls = [];
  const call = (args, options = {}) => {
    calls.push({ args, options });
    if (args.join(' ').startsWith('run services describe')) return { spec: { template: { spec: { serviceAccountName: 'backend@example.iam.gserviceaccount.com', containers: [{ env: entry ? [entry] : [] }] } } } };
    if (args.join(' ').startsWith('secrets list')) return exists ? [{ name: `projects/test/secrets/${MFA_ENV}` }] : [];
    if (args.join(' ').startsWith('secrets versions add')) return { name: `projects/test/secrets/${MFA_ENV}/versions/4` };
    if (args.join(' ').startsWith('secrets versions describe')) return { name: `projects/test/secrets/${MFA_ENV}/versions/${args[3] === 'latest' ? '3' : args[3]}`, state };
    if (args.join(' ').startsWith('secrets versions access')) return value;
    return {};
  };
  return { calls, run: () => provisionMfaSecret({ call, service: 'backend', region: 'us-west3', makeKey: () => key }) };
}
test('leaves an existing pinned key untouched', () => {
  const f = fixture({ entry: { name: MFA_ENV, valueFrom: { secretKeyRef: { name: 'existing-mfa-key', key: '2' } } } });
  assert.equal(f.run().changed, false); assert.ok(f.calls.every(c => !c.args.includes('access') && !c.args.includes('update') && !c.args.includes('create')));
});
test('creates a missing key through stdin and binds a numeric version without moving traffic', () => {
  const f = fixture({ exists: false }); const result = f.run();
  assert.equal(result.version, '1');
  assert.equal(f.calls.find(c => c.args.includes('create')).options.input, key);
  assert.ok(f.calls.every(c => !c.args.join(' ').includes(key)));
  const update = f.calls.find(c => c.args.includes('update'));
  assert.ok(update.args.includes('--no-traffic'));
  assert.ok(update.args.includes(`--update-secrets=${MFA_ENV}=${MFA_ENV}:1`));
});
test('reuses an existing secret without generating a new version', () => {
  const f = fixture(); f.run(); assert.ok(f.calls.every(c => !c.args.includes('create') && !c.args.includes('add') && !c.args.includes('access')));
});
test('migrates the exact existing literal key rather than rotating it', () => {
  const f = fixture({ entry: { name: MFA_ENV, value: key }, exists: false }); f.run();
  assert.equal(f.calls.find(c => c.args.includes('create')).options.input, key);
  assert.ok(f.calls.find(c => c.args.includes('update')).args.includes(`--remove-env-vars=${MFA_ENV}`));
});
test('preserves the current literal key without reading a different stored key', () => {
  const f = fixture({ entry: { name: MFA_ENV, value: key }, value: Buffer.alloc(32, 8).toString('base64') });
  assert.equal(f.run().version, '4'); assert.equal(f.calls.find(c => c.args.includes('add')).options.input, key);
  assert.ok(f.calls.every(c => !c.args.includes('access')));
});
test('refuses disabled versions and malformed keys', () => {
  assert.throws(() => fixture({ state: 'DISABLED' }).run(), /enabled numeric/);
  assert.throws(() => fixture({ entry: { name: MFA_ENV, value: 'invalid' } }).run(), /invalid/);
});
test('pins latest without generating or replacing key material', () => {
  const f = fixture({ entry: { name: MFA_ENV, valueFrom: { secretKeyRef: { name: MFA_ENV, key: 'latest' } } } });
  assert.equal(f.run().version, '3'); assert.ok(f.calls.every(c => !c.args.includes('create')));
});
test('does not recreate a missing secret that was already configured', () => {
  const f = fixture({ exists: false, entry: { name: MFA_ENV, valueFrom: { secretKeyRef: { name: MFA_ENV, key: 'latest' } } } });
  assert.throws(f.run, /refusing to replace/);
});
