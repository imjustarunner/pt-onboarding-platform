import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), audit: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute, getConnection: async () => mocks } }));
vi.mock('../familyBillingPolicy.service.js', () => ({ auditBilling: mocks.audit }));
import { evaluateProviderBillingRollout, saveProviderBillingRollout, providerBillingRolloutReview } from '../providerBillingRollout.service.js';
import { sharedClaimMdConnection } from '../claimMdConnection.service.js';
const entry = { providerUserId: 12, payerId: 'COCHA', status: 'active', startDate: '2026-10-15', endDate: '2026-12-31', eraDestination: 'therapynotes', routingVerified: true, requiresSupervision: true, supervisorUserId: 30 };
const scope = { agencyId: 2, providerUserId: 12, payerId: 'COCHA', serviceDate: '2026-10-15' };
const policy = { revision: 3, entries: [entry] };
const input = { ...entry, revision: 3, reference: 'Synthetic setup review', cutoverReviewed: true };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockImplementation(async sql => sql.startsWith('SELECT feature_flags') ? [[{ feature_flags: { providerBillingRollout: policy, keepOtherFeature: true } }]]
    : sql.includes('JOIN user_agencies') ? [[{ id: 12, first_name: 'Test', last_name: 'Intern' }, { id: 30, first_name: 'Test', last_name: 'Supervisor' }]] : [{ affectedRows: 1 }]);
});
describe('provider and payer claim cutover', () => {
  it('allows general billing without an individual rollout record, while enforcing recorded dates', () => {
    expect(evaluateProviderBillingRollout(null, scope).ready).toBe(true);
    for (const change of [{ providerUserId: 30 }, { payerId: 'OTHER' }])
      expect(evaluateProviderBillingRollout(policy, { ...scope, ...change }).ready).toBe(true);
    for (const change of [{ providerUserId: null }, { payerId: '' }, { serviceDate: '2026-10-14' }, { serviceDate: '2027-01-01' }, { serviceDate: '2026-02-30' }])
      expect(evaluateProviderBillingRollout(policy, { ...scope, ...change }).ready).toBe(false);
  });
  it('allows only reviewed dates, retains external ERA routing and does not distinguish H0002 from other service codes', () => {
    for (const serviceCode of ['H0002', '90834']) expect(evaluateProviderBillingRollout(policy, { ...scope, serviceCode }).ready).toBe(true);
    expect(evaluateProviderBillingRollout(policy, { ...scope, serviceDate: new Date('2026-12-31T00:00:00Z') }).ready).toBe(true);
    expect(evaluateProviderBillingRollout(policy, scope).entry.eraDestination).toBe('therapynotes');
  });
  it('a pause or unverified remittance route blocks submission immediately', () => {
    for (const change of [{ status: 'paused' }, { status: 'draft' }, { routingVerified: false }, { eraDestination: 'claimmd' }])
      expect(evaluateProviderBillingRollout({ ...policy, entries: [{ ...entry, ...change }] }, scope).ready).toBe(false);
  });
  it('revoked provider membership blocks a previously activated rollout', async () => {
    mocks.execute.mockImplementation(async sql => sql.startsWith('SELECT feature_flags') ? [[{ feature_flags: { providerBillingRollout: policy } }]] : [[]]);
    expect((await providerBillingRolloutReview(scope)).ready).toBe(false);
  });
  it('preserves established historical billing when there is no optional transition entry', async () => {
    mocks.execute.mockResolvedValue([[{ feature_flags: {} }]]);
    expect((await providerBillingRolloutReview(scope)).ready).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('saves one reviewed pair under lock without replacing unrelated practice flags', async () => {
    const result = await saveProviderBillingRollout({ agencyId: 2, actorUserId: 9, input });
    expect(result.revision).toBe(4); expect(result.entries).toHaveLength(1);
    expect(mocks.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE'))[0]).toContain('JSON_SET');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, userId: 9, objectId: 12 }), mocks);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });
  it('rejects stale edits, foreign providers, incomplete activation, and self-supervision before changes', async () => {
    for (const patch of [{ revision: 2 }, { providerUserId: 999 }, { routingVerified: false }, { cutoverReviewed: false }, { supervisorUserId: 12 }]) {
      await expect(saveProviderBillingRollout({ agencyId: 2, actorUserId: 9, input: { ...input, ...patch } })).rejects.toThrow();
    }
    expect(mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('optional transition settings cannot bypass disabled shared transmission', () => {
    const env = { CLAIM_MD_AGENCY_IDS: '2,377', CLAIM_MD_ACCOUNT_KEY: 'synthetic', CLAIM_MD_ACCOUNT_ID: 'example', CLAIM_MD_MODE: 'disabled', CLAIM_MD_MODE_2: 'disabled' };
    expect(sharedClaimMdConnection(2, env).mode).toBe('disabled');
    expect(sharedClaimMdConnection(377, env).mode).toBe('disabled');
    expect(sharedClaimMdConnection(6, env)).toBeNull();
    expect(sharedClaimMdConnection(2, { ...env, CLAIM_MD_MODE_2: 'test' }).mode).toBe('test');
  });
});
