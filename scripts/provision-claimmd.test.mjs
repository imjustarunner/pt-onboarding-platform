import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionClaimMd } from './provision-claimmd.mjs';

const config = { service: 'backend', region: 'us-west3', accountId: '31985', agencyIds: [377], secret: 'CLAIM_MD_ACCOUNT_KEY', version: '1' };
function fixture(env = [], enabled = true) {
  const calls = [];
  const call = args => {
    calls.push(args);
    if (args[0] === 'run' && args[2] === 'describe') return { spec: { template: { spec: { serviceAccountName: 'runtime@example.test', containers: [{ env }] } } } };
    if (args[0] === 'secrets' && args[1] === 'versions') return { state: enabled ? 'ENABLED' : 'DISABLED' };
    if (args[1] === 'get-iam-policy') return { bindings: [] };
    return { status: { latestCreatedRevisionName: 'candidate' } };
  };
  return { calls, call };
}
test('inspection makes no changes and never reads the credential', () => {
  const f = fixture();
  const plan = provisionClaimMd({ ...f, config });
  assert.equal(plan.applied, false);
  assert.equal(plan.mode, 'disabled');
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every(c => !c.includes('access') && !c.includes('update')));
});
test('application grants only the runtime identity secret access and stages without traffic', () => {
  const f = fixture([{ name: 'UNRELATED', valueFrom: { secretKeyRef: { name: 'KEEP', key: '2' } } }]);
  const result = provisionClaimMd({ ...f, config, apply: true });
  const grant = f.calls.find(c => c[1] === 'add-iam-policy-binding');
  assert.equal(grant[2], config.secret);
  assert.ok(grant.includes('--member=serviceAccount:runtime@example.test'));
  const update = f.calls.at(-1);
  assert.ok(update.includes('--no-traffic'));
  assert.ok(update.includes('--update-secrets=CLAIM_MD_ACCOUNT_KEY=CLAIM_MD_ACCOUNT_KEY:1'));
  assert.ok(update.some(a => a.includes('CLAIM_MD_MODE=disabled')));
  assert.ok(!update.some(a => /--set-|--clear-/.test(a)));
  assert.equal(result.revision, 'candidate');
});
test('refuses account changes, agency removal, and literal credential replacement', () => {
  for (const env of [
    [{ name: 'CLAIM_MD_ACCOUNT_ID', value: 'other-account' }],
    [{ name: 'CLAIM_MD_AGENCY_IDS', value: '377,999' }],
    [{ name: 'CLAIM_MD_ACCOUNT_KEY', value: 'sensitive-test-value' }]
  ]) {
    const f = fixture(env);
    assert.throws(() => provisionClaimMd({ ...f, config, apply: true }));
    assert.equal(f.calls.length, 1);
  }
});
test('disabled and unpinned secret versions cannot be applied', () => {
  const f = fixture([], false);
  assert.throws(() => provisionClaimMd({ ...f, config, apply: true }), /not enabled/);
  assert.throws(() => provisionClaimMd({ ...fixture(), config: { ...config, version: 'latest' }, apply: true }), /pinned/);
  assert.equal(f.calls.length, 2);
});
