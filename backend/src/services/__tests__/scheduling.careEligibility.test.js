import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), read: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../staffCareEligibility.service.js', () => ({ readStaffCareEligibility: mocks.read }));
vi.mock('../billingPolicy.service.js', () => ({ isServiceCodeEnabledForAgency: async () => true, resolvePolicyRuleForServiceCode: async () => null }));
import { getSchedulingBookingMetadata, validateSchedulingSelection } from '../schedulingTaxonomy.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ canProvideCare: false, credentialTier: 'bachelors' });
  mocks.execute.mockImplementation(async sql => {
    if (sql.includes('FROM appointment_types')) return [[{ code: 'SESSION' }, { code: 'MEETING' }]];
    if (sql.includes('FROM appointment_subtypes')) return [[]];
    return [[{ code: 'H0004', label: 'Counseling', is_billable: 1 }]];
  });
});
describe('scheduling requires a care assignment as well as credentials', () => {
  it('returns no eligible care codes for an employee who has a BA but no care assignment', async () => {
    const result = await getSchedulingBookingMetadata({ agencyId: 6, providerId: 8, userRole: 'staff', providerCredentialText: 'BA' });
    expect(result.eligibleServiceCodes).toEqual([]);
    expect(mocks.read).toHaveBeenCalledWith(8, 6);
  });
  it('rejects a direct service request even when the credential policy allows the code', async () => {
    await expect(validateSchedulingSelection({ agencyId: 6, providerId: 8, appointmentTypeCode: 'SESSION', serviceCode: 'H0004' })).rejects.toMatchObject({ status: 403 });
  });
  it('preserves nonclinical meetings for staff', async () => {
    await expect(validateSchedulingSelection({ agencyId: 6, providerId: 8, appointmentTypeCode: 'MEETING' })).resolves.toMatchObject({ appointmentTypeCode: 'MEETING' });
  });
  it('allows the shared credential policy after an explicit care assignment', async () => {
    mocks.read.mockResolvedValue({ canProvideCare: true, credentialTier: 'bachelors' });
    await expect(validateSchedulingSelection({ agencyId: 6, providerId: 8, appointmentTypeCode: 'SESSION', serviceCode: 'H0004' })).resolves.toMatchObject({ serviceCode: 'H0004' });
  });
});
