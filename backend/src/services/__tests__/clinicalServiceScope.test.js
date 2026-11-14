import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../testingEligibility.service.js',()=>({requireTestingEligibility:vi.fn()}));
vi.mock('../providerServiceOfferings.service.js',()=>({readProviderServices:vi.fn()}));
import {readProviderServices} from '../providerServiceOfferings.service.js';
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import ClinicalEligibility from '../clinicalEligibility.service.js';
beforeEach(()=>{vi.resetAllMocks();User.getAgencies.mockResolvedValue([{id:453}]);readProviderServices.mockResolvedValue({services:[{serviceType:'counseling',offered:false}]});});
it('denies direct clinical access for an explicitly tutoring-only provider in a mixed agency',async()=>{
 await expect(ClinicalEligibility.ensureAgencyAccess({requireClinicalService:true,reqUser:{id:1496,role:'provider'},agencyId:453})).rejects.toMatchObject({status:403});
});
it('allows an explicitly mixed provider without replacing clinical assignment and signing checks',async()=>{
 readProviderServices.mockResolvedValue({services:[{serviceType:'counseling',offered:true}]});
 await expect(ClinicalEligibility.ensureAgencyAccess({requireClinicalService:true,reqUser:{id:1433,role:'provider'},agencyId:453})).resolves.toBe(true);
});
it('preserves legacy clinical eligibility but never substitutes another agency membership',async()=>{
 readProviderServices.mockResolvedValue({services:[]});await expect(ClinicalEligibility.ensureAgencyAccess({requireClinicalService:true,reqUser:{id:9,role:'provider'},agencyId:453})).resolves.toBe(true);
 await expect(ClinicalEligibility.ensureAgencyAccess({requireClinicalService:true,reqUser:{id:9,role:'provider'},agencyId:6})).rejects.toMatchObject({status:403});
});

it('retains tutoring booking capability and own-pay agency checks without claiming clinical access',async()=>{
 await expect(ClinicalEligibility.ensureAgencyAccess({reqUser:{id:1496,role:'provider'},agencyId:453})).resolves.toBe(true);
 expect(readProviderServices).not.toHaveBeenCalled();
});
