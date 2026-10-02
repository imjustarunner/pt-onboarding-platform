import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { assertServiceCodeAllowed, eligibleServiceCodesForTier } from '../../utils/clinicalServiceCodeEligibility.js';
import { resolvePolicyRuleForServiceCode } from '../billingPolicy.service.js';
import { filterCodesForProviderTier } from '../medicalBillingDefaults.service.js';
describe('bachelor service code restrictions', () => {
  it.each(['90791', '90785', '90832', '90834', '90837', '90853', '97535', '99051'])('blocks %s even when a saved list incorrectly allows it', async code => {
    expect(() => assertServiceCodeAllowed({ tier: 'bachelors', serviceCode: code, allowedCodes: [code] })).toThrow();
    expect(await resolvePolicyRuleForServiceCode({ agencyId: 6, credentialTier: 'bachelors', serviceCode: code })).toMatchObject({ allowedForCredentialTier: false });
    expect(filterCodesForProviderTier([{ service_code: code, allowed_credential_tiers_json: ['bachelors', 'intern_plus'] }], 'bachelors')).toEqual([]);
  });
  it('keeps permitted H-codes while excluding 9-series fallback codes', () => {
    const codes = eligibleServiceCodesForTier('bachelors');
    expect(codes).toEqual(expect.arrayContaining(['H0004', 'H2014']));
    expect(codes.some(code => code.startsWith('9'))).toBe(false);
  });
  it('does not turn an empty allowed list into unrestricted permission', () => {
    expect(() => assertServiceCodeAllowed({ tier: 'bachelors', serviceCode: 'H0004', allowedCodes: [] })).toThrow();
  });
  it('preserves other credential tiers', () => {
    expect(() => assertServiceCodeAllowed({ tier: 'intern_plus', serviceCode: '90837' })).not.toThrow();
  });
});
