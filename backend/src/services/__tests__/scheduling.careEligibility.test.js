import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), read: vi.fn(), rollout: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../staffCareEligibility.service.js', () => ({ readStaffCareEligibility: mocks.read }));
vi.mock('../clientSessionBookingRollout.service.js', () => ({ requireClientSessionBooking: mocks.rollout }));
vi.mock('../billingPolicy.service.js', () => ({ isServiceCodeEnabledForAgency: async () => true, resolvePolicyRuleForServiceCode: async () => null }));
import { getSchedulingBookingMetadata, validateSchedulingSelection } from '../schedulingTaxonomy.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rollout.mockResolvedValue({enabled:true});
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
  it('validates an in-person tutoring selection without opening the clinical transition',async()=>{
    mocks.read.mockResolvedValue({canProvideCare:true,credentialTier:'bachelors'});
    mocks.execute.mockImplementation(async sql=>sql.includes('FROM appointment_types')?[[{code:'SESSION'}]]:
      sql.includes('FROM appointment_subtypes')?[[]]:sql.includes('FROM provider_service_code_grants')?
        [[{service_code:'TUTORING'}]]:[[{code:'TUTORING',label:'Tutoring'}]]);
    mocks.rollout.mockImplementation(async(_agency,_provider,_db,options)=>{
      if(options?.businessType!=='tutoring')throw Object.assign(new Error('Clinical transition not enabled'),{status:403});
      return {enabled:true};
    });
    await expect(validateSchedulingSelection({agencyId:453,providerId:1496,enforceSessionRollout:true,
      appointmentTypeCode:'SESSION',serviceCode:'TUTORING',modality:'IN_PERSON'}))
      .resolves.toMatchObject({serviceCode:'TUTORING',modality:'IN_PERSON'});
    await expect(validateSchedulingSelection({agencyId:453,providerId:1496,enforceSessionRollout:true,
      appointmentTypeCode:'SESSION',serviceCode:'90837',modality:'IN_PERSON'}))
      .rejects.toMatchObject({status:403});
  });
});
