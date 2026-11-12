import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ profiles: vi.fn(), rules: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/PayrollCompensationLevel.model.js', () => ({ default: {
  listForAgency: async () => [{ category: 2, level: 1, direct_rate: 26, indirect_rate: 20 }],
  getLevelRatesForAgency: async () => ({})
} }));
vi.mock('../../models/PayrollPaySystemRate.model.js', () => ({ default: { listForAgency: mocks.profiles } }));
vi.mock('../../models/PayrollServiceCodeRule.model.js', () => ({ default: { listForAgency: mocks.rules } }));
import { contractCompensationLevels, contractServiceRates } from '../contractCompensation.service.js';
import { NLU_COMPENSATION_POLICY_VERSION } from '../../content/nluCompensationPolicy.js';
const profile = { id: 1, category: 2, level: 1, creditRate: 26, indirectRate: 20,
  nluCompensationPolicyVersion: NLU_COMPENSATION_POLICY_VERSION, nluCompensationEffectiveOn: '2099-11-21' };
const rules = [{ service_code: 'TUTORING 15 MIN', category: 'tutoring', show_in_rate_sheet: 1 }];
beforeEach(() => { mocks.profiles.mockResolvedValue([profile]); mocks.rules.mockResolvedValue(rules); });
describe('optional contract rate illustrations', () => {
  it('returns saved compensation with the policy review message instead of rejecting the wizard', async () => {
    const rows = await contractCompensationLevels(6, { includeServiceRates: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 2, level: 1, direct_rate: 26,
      serviceRatesError: 'Review the actual service date and prior individual terms before applying the new NLU service schedule.' });
    expect(rows[0].serviceRates).toBeUndefined();
  });
  it('still rejects an actual rate calculation with missing policy prerequisites', () => {
    expect(() => contractServiceRates({ category: 2, level: 1, paySystem: profile }, rules))
      .toThrow('Review the actual service date');
  });
  it('keeps actual-time review visible after the schedule becomes effective', async () => {
    mocks.profiles.mockResolvedValue([{ ...profile, nluCompensationEffectiveOn: '2020-01-01' }]);
    const [row] = await contractCompensationLevels(6, { includeServiceRates: true });
    expect(row.serviceRatesError).toContain('Record actual work minutes');
    expect(row.serviceRates).toBeUndefined();
  });
  it('does not suppress infrastructure failures', async () => {
    mocks.rules.mockRejectedValue(new Error('Database unavailable'));
    await expect(contractCompensationLevels(6, { includeServiceRates: true })).rejects.toThrow('Database unavailable');
  });
});
