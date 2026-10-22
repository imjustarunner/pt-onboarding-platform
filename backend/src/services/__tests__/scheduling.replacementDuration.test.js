import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../selfPayRates.service.js',()=>({getAgencySelfPayOnly:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/BookingPackage.model.js',()=>({default:{findEntitlementById:vi.fn()}}));
vi.mock('../schedulingTaxonomy.service.js',()=>({validateSchedulingSelection:vi.fn()}));
import {getAgencySelfPayOnly} from '../selfPayRates.service.js';
import User from '../../models/User.model.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import {validateSchedulingSelection} from '../schedulingTaxonomy.service.js';
import {validateReplacementDuration} from '../replacementDuration.service.js';
const appointment={agencyId:2,providerUserId:5,tenantServiceId:3,serviceCode:'90837',businessType:'mental_health'};
const slot={startAt:'2030-01-04T17:00:00Z',endAt:'2030-01-04T17:30:00Z',modality:'VIRTUAL'};
beforeEach(()=>{vi.clearAllMocks();getAgencySelfPayOnly.mockResolvedValue(false);User.findById.mockResolvedValue({role:'provider',credential:'LPC'});validateSchedulingSelection.mockResolvedValue({});});
it('checks the preserved clinical service against the proposed appointment length and format',async()=>{
  validateSchedulingSelection.mockRejectedValueOnce(Object.assign(new Error('90837 requires at least 53 minutes'),{status:400}));
  await expect(validateReplacementDuration(appointment,slot)).rejects.toThrow('53 minutes');
  expect(validateSchedulingSelection).toHaveBeenCalledWith(expect.objectContaining({serviceCode:'90837',scheduledStartAt:slot.startAt,scheduledEndAt:slot.endAt,modality:'VIRTUAL',providerId:5,agencyId:2}));
});
it('preserves the duration of a purchased package',async()=>{
  BookingPackage.findEntitlementById.mockResolvedValue({pricingSnapshot:{mode:'provider-discount',providerId:5,tenantServiceId:3,minutes:60,format:'virtual'}});
  await expect(validateReplacementDuration({...appointment,packageEntitlementId:9},slot)).rejects.toThrow('match the purchased package');
  expect(validateSchedulingSelection).not.toHaveBeenCalled();
});
it('uses the self-pay booking rules without applying insurance service-code lengths',async()=>{
  getAgencySelfPayOnly.mockResolvedValue(true);await validateReplacementDuration(appointment,slot);expect(validateSchedulingSelection).not.toHaveBeenCalled();
});
it('does not apply clinical code restrictions to a tutoring service',async()=>{
  await validateReplacementDuration({...appointment,businessType:'tutoring',serviceCode:'TUTORING'},slot);expect(validateSchedulingSelection).not.toHaveBeenCalled();
});
