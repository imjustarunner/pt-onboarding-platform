import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/AgencyMedicalServiceCode.model.js',()=>({default:{}}));
import { assertConfiguredTestingReferenceCodes } from '../testingCatalogClaimGuard.service.js';
import { TESTING_SERVICE_CODES } from '../../content/testingServicePolicy.js';
const find=vi.fn();beforeEach(()=>{vi.clearAllMocks();});
it.each(TESTING_SERVICE_CODES.map(row=>[row.code]))('rejects inactive reference %s even when a caller knows its code',async code=>{
 find.mockResolvedValue({isActive:false,unitCalcMode:'NONE'});await expect(assertConfiguredTestingReferenceCodes({agencyId:6,serviceCodes:[code]},{find})).rejects.toMatchObject({status:403,code:'SERVICE_CODE_INACTIVE'});expect(find).toHaveBeenCalledWith(6,code);
});
it('rejects a missing Testing reference and active reference whose unit setup is still pending',async()=>{
 find.mockResolvedValueOnce(null).mockResolvedValueOnce({isActive:true,unitCalcMode:'NONE'});await expect(assertConfiguredTestingReferenceCodes({agencyId:2,serviceCodes:['96136']},{find})).rejects.toMatchObject({code:'SERVICE_CODE_INACTIVE'});await expect(assertConfiguredTestingReferenceCodes({agencyId:2,serviceCodes:['96136']},{find})).rejects.toMatchObject({code:'SERVICE_UNIT_SETUP_REQUIRED'});
});
it('allows explicitly enabled, configured references and leaves unrelated legacy codes unchanged',async()=>{
 find.mockResolvedValue({isActive:true,unitCalcMode:'CUSTOM_BANDS'});await assertConfiguredTestingReferenceCodes({agencyId:377,serviceCodes:['96136','96136','90837']},{find});expect(find).toHaveBeenCalledTimes(1);expect(find).toHaveBeenCalledWith(377,'96136');find.mockClear();await assertConfiguredTestingReferenceCodes({agencyId:2,serviceCodes:['90837']},{find});expect(find).not.toHaveBeenCalled();
});
