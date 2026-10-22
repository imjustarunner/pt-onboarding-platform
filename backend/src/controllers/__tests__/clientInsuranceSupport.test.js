import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/GuardianInsuranceProfile.model.js',()=>({decodeInsuranceProfile:row=>row}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/clientAccountSupportAccess.service.js',()=>({requireClientAccountSupport:vi.fn()}));
vi.mock('../../services/clientInsurance.service.js',()=>({readClientInsurance:vi.fn(),writeClientInsurance:vi.fn(),claimInsuranceIssues:vi.fn(()=>[]),insuranceDemographics:vi.fn(async()=>({firstName:'Test'}))}));
vi.mock('../../services/familyBillingPolicy.service.js',()=>({positiveId:Number,auditBilling:vi.fn()}));
import pool from '../../config/database.js';
import { requireClientAccountSupport } from '../../services/clientAccountSupportAccess.service.js';
import { readClientInsurance, writeClientInsurance } from '../../services/clientInsurance.service.js';
import { getSupportClientInsurance, saveSupportClientInsurance } from '../clientInsurance.controller.js';
const req=()=>({user:{id:10,role:'support',billingAgencyIds:[]},params:{id:20},body:{primary:{insurerName:'Updated',memberId:'MEMBER'},patient:{firstName:'Test'}}});
const res=()=>({set:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{
  vi.clearAllMocks();requireClientAccountSupport.mockResolvedValue({id:20,agency_id:2});pool.execute.mockResolvedValue([[]]);
  readClientInsurance.mockResolvedValue({primary:{insurerName:'Previous'},acceptAssignment:true,verifiedForClaims:true,confirmedBy:99});
  writeClientInsurance.mockImplementation(async value=>value);
});
it('reads insurance without disclosing claim verification metadata or requesting billing access',async()=>{
  const response=res(),next=vi.fn();await getSupportClientInsurance(req(),response,next);
  expect(next).not.toHaveBeenCalled();expect(requireClientAccountSupport).toHaveBeenCalledWith(expect.objectContaining({role:'support'}),20);
  expect(response.json.mock.calls[0][0]).toMatchObject({insurance:{primary:{insurerName:'Previous'}},demographics:{firstName:'Test'}});
  expect(JSON.stringify(response.json.mock.calls[0][0])).not.toMatch(/verifiedForClaims|acceptAssignment|confirmedBy|missingClaimFields/);
});
it('saves partial insurance, resets verification, and preserves the billing assignment decision',async()=>{
  const response=res(),next=vi.fn();await saveSupportClientInsurance(req(),response,next);
  expect(next).not.toHaveBeenCalled();
  expect(writeClientInsurance).toHaveBeenCalledWith(expect.objectContaining({clientId:20,agencyId:2,primary:{insurerName:'Updated',memberId:'MEMBER'},verifiedForClaims:false,acceptAssignment:true,confirmedBy:10}));
  expect(response.json.mock.calls[0][0].insurance).not.toHaveProperty('verifiedForClaims');
});
it.each([{verifiedForClaims:true},{acceptAssignment:false}])('rejects forged billing-only controls %j',async fields=>{
  const request=req();Object.assign(request.body,fields);const next=vi.fn();await saveSupportClientInsurance(request,res(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(writeClientInsurance).not.toHaveBeenCalled();
});
it('rejects policy sources belonging to another client',async()=>{
  const request=req();request.body.coverageSources={primary:{profileId:999,slot:'primary'}};
  const next=vi.fn();await saveSupportClientInsurance(request,res(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(writeClientInsurance).not.toHaveBeenCalled();
});
it('uses the authorized client agency regardless of submitted agency or client IDs',async()=>{
  const request=req();Object.assign(request.body,{agencyId:999,clientId:999,confirmedBy:999});
  await saveSupportClientInsurance(request,res(),vi.fn());
  expect(writeClientInsurance).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:20,confirmedBy:10}));
});
it('denies revoked access before reading private insurance or saving',async()=>{
  requireClientAccountSupport.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));
  for(const handler of [getSupportClientInsurance,saveSupportClientInsurance]){const next=vi.fn();await handler(req(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));}
  expect(readClientInsurance).not.toHaveBeenCalled();expect(writeClientInsurance).not.toHaveBeenCalled();
});
