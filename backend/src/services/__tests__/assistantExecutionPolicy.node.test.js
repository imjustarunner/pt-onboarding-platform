import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertAssistantExecution, assertUnchangedAssistantConfiguration } from '../assistantExecutionPolicy.service.js';
import { assistantDigest, assistantConfigurationHash, assistantStoredConfigurationHash } from '../assistantTeamPolicy.js';

const account = (extra = {}) => {
  const value = { id: 4, user_id: 81, agency_id: 2, subrole: 'payroll', status: 'active', group_status: 'ready',
    baa_status: 'pending', privacy_policy_json: {}, schedule_json: {}, policy_revision: 1, capabilities_json: ['payroll.review'], ...extra };
  return { ...value, configuration_fingerprint: assistantStoredConfigurationHash(value) };
};
describe('current assistant execution authority', () => {
  it('requires current production evidence for the exact account, capability and configuration', async () => {
    let params;
    const db = { execute: async (_sql, values) => { params = values; return [[{ id: 10 }]]; } };
    await assertAssistantExecution(account(), 'payroll.review', db);
    assert.equal(params[0], 4); assert.equal(params[1], 'payroll.review');
    assert.equal(params[3], assistantConfigurationHash(account()));
    await assert.rejects(assertAssistantExecution(account(), 'payroll.review', { execute: async () => [[]] }), { code: 'CAPABILITY_NOT_VERIFIED' });
  });
  it('does not continue after capability withdrawal, pause or group drift', async () => {
    for (const extra of [{ status: 'paused' }, { capabilities_json: [] }, { group_status: 'drift' }]) {
      await assert.rejects(assertAssistantExecution(account(extra), 'payroll.review', { execute: async () => [[{ id: 1 }]] }));
    }
  });
  it('permits synthetic QA exercises without certifying production', async () => {
    await assertAssistantExecution(account({ agency_id: 450 }), 'payroll.review', { execute: async () => { throw Error('must not use production receipt'); } });
    await assertAssistantExecution(account({ agency_id: 453 }), 'payroll.review', {});
  });
  it('hashes equivalent JSON identically after database key canonicalization', () => {
    assert.equal(assistantDigest({ z: 1, privacy: { beta: 2, alpha: 1 } }), assistantDigest({ privacy: { alpha: 1, beta: 2 }, z: 1 }));
    assert.equal(assistantDigest({ at: new Date('2026-11-02T00:00:00Z') }), assistantDigest({ at: '2026-11-02T00:00:00.000Z' }));
    assert.notEqual(assistantDigest([1, 2]), assistantDigest([2, 1]));
  });
  it('rejects configuration changes observed after acquiring the account lock', () => {
    assert.doesNotThrow(() => assertUnchangedAssistantConfiguration(account(), account()));
    assert.throws(() => assertUnchangedAssistantConfiguration(account(), account({ policy_revision: 2 })), { code: 'ASSISTANT_CONFIGURATION_CHANGED' });
    assert.throws(() => assertUnchangedAssistantConfiguration(account(), account({ privacy_policy_json: { revision: 'changed' } })), { code: 'ASSISTANT_CONFIGURATION_CHANGED' });
  });
  it('blocks a direct stored capability edit before the drift maintenance job runs', async () => {
    const changed = { ...account(), capabilities_json: ['payroll.review', 'other.unverified'] };
    await assert.rejects(assertAssistantExecution(changed, 'payroll.review', { execute: async () => [[{ id: 10 }]] }), { code: 'ASSISTANT_CONFIGURATION_CHANGED' });
  });
});
