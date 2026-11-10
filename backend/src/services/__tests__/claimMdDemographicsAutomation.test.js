import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../clientInsurance.service.js',async original=>({...await original(),readClientInsurance:vi.fn(),writeClientInsurance:vi.fn()}));
vi.mock('../intakeEligibility.service.js',()=>({enqueueIntakeEligibility:vi.fn()}));
import {readClientInsurance,writeClientInsurance} from '../clientInsurance.service.js';
import {syncInsuranceDemographicsForEligibility} from '../insuranceDemographicsAutomation.service.js';
const row=()=>({id:8,agency_id:2,full_name:'Test Member',date_of_birth:'2010-01-02',feature_flags:{medicalBillingEnabled:true,intakeEligibilityAutomation:{enabled:true,medicaidState:'CO'}}});
beforeEach(()=>{vi.clearAllMocks();readClientInsurance.mockResolvedValue(null);writeClientInsurance.mockImplementation(async v=>v);});
it.each([2,6,377])('queues newly complete chart identity for agency %i without asserting Medicaid coverage',async agencyId=>{
 const db={execute:vi.fn().mockResolvedValue([[{...row(),agency_id:agencyId}]])};
 const result=await syncInsuranceDemographicsForEligibility(8,db);
 expect(result).toMatchObject({agencyId,clientId:8,patient:{firstName:'Test',lastName:'Member',dateOfBirth:'2010-01-02'},primary:{},verifiedForClaims:false});
 expect(result.primary.isMedicaid).not.toBe(true);expect(writeClientInsurance).toHaveBeenCalledWith(result,db);
});
it('fills a missing DOB from a chart edit but preserves the client’s existing policies',async()=>{
 const insurance={primary:{isMedicaid:true,memberId:'SYNTHETIC'},secondary:{insurerName:'Other insurer'},patient:{firstName:'Test',lastName:'Member'}};
 readClientInsurance.mockResolvedValue(insurance);const db={execute:vi.fn().mockResolvedValue([[row()]])};
 await syncInsuranceDemographicsForEligibility(8,db);
 expect(writeClientInsurance).toHaveBeenCalledWith(expect.objectContaining({primary:insurance.primary,secondary:insurance.secondary,patient:expect.objectContaining({dateOfBirth:'2010-01-02'})}),db);
});
it('does not rewrite or queue an unchanged billing identity or a disabled agency',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{...row(),feature_flags:{}}]])};
 await syncInsuranceDemographicsForEligibility(8,db);expect(writeClientInsurance).not.toHaveBeenCalled();
 const patient={firstName:'Test',lastName:'Member',dateOfBirth:'2010-01-02'};
 readClientInsurance.mockResolvedValue({primary:{},patient});db.execute.mockResolvedValue([[row()]]);
 await syncInsuranceDemographicsForEligibility(8,db);expect(writeClientInsurance).not.toHaveBeenCalled();
});
it('keeps the chart lookup and queue update in the same transaction',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[row()]]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
 await syncInsuranceDemographicsForEligibility(8,{getConnection:async()=>db});
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),[8]);expect(db.commit).toHaveBeenCalledTimes(1);expect(db.release).toHaveBeenCalledTimes(1);
});
