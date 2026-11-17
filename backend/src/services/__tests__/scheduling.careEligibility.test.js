import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), read: vi.fn(), rollout: vi.fn(),offered:vi.fn(),tutoringServices:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../staffCareEligibility.service.js', () => ({ readStaffCareEligibility: mocks.read }));
vi.mock('../clientSessionBookingRollout.service.js', () => ({ requireClientSessionBooking: mocks.rollout }));
vi.mock('../providerServiceOfferings.service.js',()=>({readProviderServices:mocks.offered}));
vi.mock('../../models/TenantService.model.js',()=>({default:{listForAgency:mocks.tutoringServices}}));
vi.mock('../billingPolicy.service.js', () => ({ isServiceCodeEnabledForAgency: async () => true, resolvePolicyRuleForServiceCode: async () => null }));
import { getSchedulingBookingMetadata, validateSchedulingSelection } from '../schedulingTaxonomy.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rollout.mockResolvedValue({enabled:true});
  mocks.offered.mockResolvedValue({careEligibility:{canProvideCare:false},services:[]});
  mocks.tutoringServices.mockResolvedValue([]);
  mocks.read.mockResolvedValue({ canProvideCare: false, credentialTier: 'bachelors' });
  mocks.execute.mockImplementation(async sql => {
    if (sql.includes('FROM appointment_types')) return [[{ code: 'SESSION' }, { code: 'MEETING' }]];
    if (sql.includes('FROM appointment_subtypes')) return [[]];
    return [[{ code: 'H0004', label: 'Counseling', is_billable: 1 }]];
  });
});
describe('scheduling requires a care assignment as well as credentials', () => {
  it('loads only the configured tutoring code for an agency tutor and keeps clinical codes unavailable',async()=>{
    mocks.read.mockResolvedValue({canProvideCare:false,canProvideTutoring:true,credentialTier:'unknown'});
    mocks.offered.mockResolvedValue({careEligibility:{canProvideCare:false,canProvideTutoring:true},services:[{serviceType:'tutoring',offered:true}]});
    mocks.tutoringServices.mockResolvedValue([{id:320,businessType:'tutoring',serviceCode:'TUTORING',name:'Tutoring',defaultDurationMinutes:60,isActive:true}]);
    mocks.execute.mockImplementation(async sql=>sql.includes('FROM appointment_types')?[[{code:'SESSION'}]]:[[]]);
    expect((await getSchedulingBookingMetadata({agencyId:6,providerId:8,businessType:'tutoring'})).eligibleServiceCodes.map(row=>row.code)).toEqual(['TUTORING']);
    expect((await getSchedulingBookingMetadata({agencyId:6,providerId:8,businessType:'mental_health'})).eligibleServiceCodes).toEqual([]);
  });
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
  it('uses the configured academic service for an assigned tutor without clinical credentials or grants',async()=>{
    mocks.read.mockResolvedValue({canProvideCare:true,credentialTier:'unknown'});
    mocks.execute.mockImplementation(async sql=>sql.includes('FROM appointment_types')?[[{code:'SESSION'}]]:
      sql.includes('FROM appointment_subtypes')||sql.includes('FROM provider_service_code_grants')?[[]]:[[{code:'TUTORING',label:'Tutoring'}]]);
    mocks.offered.mockResolvedValue({careEligibility:{canProvideCare:true},services:[{serviceType:'tutoring',offered:true}]});
    mocks.tutoringServices.mockResolvedValue([{id:320,businessType:'tutoring',serviceCode:'TUTORING',name:'Tutoring',defaultDurationMinutes:60,isActive:true}]);
    const input={agencyId:453,providerId:1496,enforceSessionRollout:true,appointmentTypeCode:'SESSION',
      serviceCode:'TUTORING',tenantServiceId:320,modality:'IN_PERSON'};
    await expect(validateSchedulingSelection(input)).resolves.toMatchObject({serviceCode:'TUTORING',modality:'IN_PERSON'});
    mocks.offered.mockResolvedValue({careEligibility:{canProvideCare:true},services:[{serviceType:'tutoring',offered:false}]});
    await expect(validateSchedulingSelection(input)).rejects.toMatchObject({status:403});
    mocks.offered.mockResolvedValue({careEligibility:{canProvideCare:true},services:[{serviceType:'tutoring',offered:true}]});
    await expect(validateSchedulingSelection({...input,tenantServiceId:999})).rejects.toMatchObject({status:403});
  });
});
