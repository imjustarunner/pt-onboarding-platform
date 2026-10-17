import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/GuardianInsuranceProfile.model.js',()=>({decodeInsuranceProfile:row=>row}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/clientInsurance.service.js',()=>({readClientInsurance:vi.fn(),writeClientInsurance:vi.fn(),claimInsuranceIssues:()=>[],insuranceDemographics:vi.fn()}));
vi.mock('../../services/familyBillingPolicy.service.js',()=>({positiveId:n=>Number(n),auditBilling:vi.fn()}));
import pool from '../../config/database.js';
import {writeClientInsurance} from '../../services/clientInsurance.service.js';
import {saveClientInsurance} from '../clientInsurance.controller.js';
const request=()=>({user:{id:9},params:{clientId:101},body:{agencyId:1,primary:{insurerName:'First'},secondary:{insurerName:'Second'},coverageSources:{primary:{profileId:11,slot:'primary'},secondary:{profileId:22,slot:'primary'}}}});
const response=()=>({set:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[{id:101,primary:{insurerName:'Allowed'}}]]);writeClientInsurance.mockImplementation(async data=>data);});
it('validates both policy sources against the client and agency before recording billing order',async()=>{
 const next=vi.fn();await saveClientInsurance(request(),response(),next);expect(next).not.toHaveBeenCalled();
 expect(pool.execute.mock.calls.filter(([sql])=>sql.includes('SELECT DISTINCT p.*')).map(([,args])=>args)).toEqual([[11,1,101,101],[22,1,101,101]]);
 expect(writeClientInsurance).toHaveBeenCalledWith(expect.objectContaining({profileId:11,coverageSources:{primary:{profileId:11,slot:'primary'},secondary:{profileId:22,slot:'primary'}}}));
});
it('rejects another client’s or agency’s submitted coverage without changing the chart',async()=>{
 pool.execute.mockImplementation(async(sql,args)=>sql.includes('SELECT DISTINCT p.*')&&args[0]===22?[[]]:[[{id:101,primary:{}}]]);
 const next=vi.fn();await saveClientInsurance(request(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(writeClientInsurance).not.toHaveBeenCalled();
});
it('rejects assigning the same policy to both billing positions',async()=>{
 const req=request();req.body.coverageSources.secondary={profileId:11,slot:'primary'};const next=vi.fn();await saveClientInsurance(req,response(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));expect(writeClientInsurance).not.toHaveBeenCalled();
});
