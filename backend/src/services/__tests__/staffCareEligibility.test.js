import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { staffCareEligibility, requireStaffCareEligibility } from '../staffCareEligibility.service.js';

const person = { role: 'staff', credential: 'BA', status: 'ACTIVE_EMPLOYEE', is_active: 1,
  membership_active: 1, sees_clients: 1, has_provider_access: 0 };
describe('agency care assignment is independent of academic credentials', () => {
  it.each(['BA', 'MA', 'MA, Unlicensed Masters', 'PhD', 'LPC'])('never grants care from %s alone', credential => {
    expect(staffCareEligibility({ ...person, credential }, 6).canProvideCare).toBe(false);
  });
  it.each(['admin', 'super_admin', 'support', 'staff'])('does not turn %s access into a provider assignment', role => {
    expect(staffCareEligibility({ ...person, role, sees_clients: 0 }, 6).canProvideCare).toBe(false);
  });
  it('requires both a care role and Sees clients, regardless of degree', () => {
    expect(staffCareEligibility({ ...person, agency_role: 'facilitator' }, 6)).toMatchObject({ canProvideCare: true, credentialTier: 'bachelors' });
    expect(staffCareEligibility({ ...person, agency_role: 'facilitator', sees_clients: 0 }, 6).canProvideCare).toBe(false);
  });
  it('keeps global admin access separate from tenant-specific provider work', () => {
    expect(staffCareEligibility({ ...person, role: 'super_admin', agency_role: 'provider' }, 6).canProvideCare).toBe(true);
    expect(staffCareEligibility({ ...person, role: 'provider', agency_role: 'staff', has_provider_access: 1 }, 6).canProvideCare).toBe(false);
  });
  it('honors each agency independently without treating new-client closure as revocation', () => {
    const p = { ...person, agency_role: 'provider', public_details_json: { availabilityByAgency: {
      1: { seesClients: false }, 6: { seesClients: true, acceptingNewClients: false }
    } } };
    expect(staffCareEligibility(p, 1).canProvideCare).toBe(false);
    expect(staffCareEligibility(p, 6).canProvideCare).toBe(true);
  });
  it.each([{ is_active: 0 }, { membership_active: 0 }, { status: 'ARCHIVED' }])('rejects inactive people or memberships: %j', change => {
    expect(staffCareEligibility({ ...person, agency_role: 'provider', ...change }, 6).canProvideCare).toBe(false);
  });
  it('requires an actual membership and returns a 403 to direct API callers', async () => {
    const db = { execute: vi.fn().mockResolvedValue([[]]) };
    await expect(requireStaffCareEligibility(8, 6, db)).rejects.toMatchObject({ status: 403, code: 'CARE_PROVIDER_ASSIGNMENT_REQUIRED' });
    expect(db.execute.mock.calls[0][1]).toEqual([6, 8]);
  });
});
