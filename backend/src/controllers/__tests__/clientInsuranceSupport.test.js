import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/GuardianInsuranceProfile.model.js',()=>({decodeInsuranceProfile:row=>row}));
vi.mock('../../models/ClientPhiDocument.model.js',()=>({default:{findSchoolPaperPacket:vi.fn()}}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/clientAccountSupportAccess.service.js',()=>({requireClientAccountSupport:vi.fn()}));
vi.mock('../../services/clientInsurance.service.js',()=>({readClientInsurance:vi.fn(),writeClientInsurance:vi.fn(),claimInsuranceIssues:vi.fn(()=>[]),insuranceDemographics:vi.fn(async()=>({firstName:'Test'}))}));
vi.mock('../../services/familyBillingPolicy.service.js',()=>({positiveId:Number,auditBilling:vi.fn()}));
vi.mock('../../services/eligibilityProfile.service.js',()=>({readEligibilityProfile:vi.fn(async()=>[])}));
import pool from '../../config/database.js';
import ClientPhiDocument from '../../models/ClientPhiDocument.model.js';
import { requireClientAccountSupport } from '../../services/clientAccountSupportAccess.service.js';
import { readClientInsurance, writeClientInsurance } from '../../services/clientInsurance.service.js';
import { getSupportClientInsurance, saveSupportClientInsurance, saveClientInsurance } from '../clientInsurance.controller.js';
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
  expect(JSON.stringify(response.json.mock.calls[0][0])).not.toMatch(/verifiedForClaims|acceptAssignment|confirmedBy|missingClaimFields|eligibilityFindings/);
});
it('never queues processor saves, including cached confirmation flags and forged finalization metadata',async()=>{
 readClientInsurance.mockResolvedValue({primary:{},paperReviewRequired:true,paperSourceDocumentId:9});ClientPhiDocument.findSchoolPaperPacket.mockResolvedValue({id:9,client_id:20,agency_id:2,scan_status:'clean'});
 const request=req();request.body.paperDocumentId=9;request.body.paperReviewActorId=999;request.body.paperReview={approvalId:'forged'};
 let next=vi.fn();await saveSupportClientInsurance(request,res(),next);expect(next).not.toHaveBeenCalled();expect(writeClientInsurance.mock.calls.at(-1)[0]).toMatchObject({queueEligibility:false,paperFinalization:null,paperSourceDocumentId:9});expect(writeClientInsurance.mock.calls.at(-1)[0]).not.toHaveProperty('paperReview');
 request.body.paperReviewConfirmed=true;request.body.checkCoverage=true;request.body.paperFinalization={finalizedAt:'forged'};next=vi.fn();await saveSupportClientInsurance(request,res(),next);expect(next).not.toHaveBeenCalled();expect(writeClientInsurance.mock.calls.at(-1)[0]).toMatchObject({queueEligibility:false,paperFinalization:null});
});
it.each([{client_id:21,agency_id:2,scan_status:'clean'},{client_id:20,agency_id:3,scan_status:'clean'},{client_id:20,agency_id:2,scan_status:'pending'}])('rejects confirmation against another client/agency or an unchecked source: %j',async source=>{
 readClientInsurance.mockResolvedValue({primary:{},paperReviewRequired:true,paperSourceDocumentId:9});ClientPhiDocument.findSchoolPaperPacket.mockResolvedValue({id:9,...source});const request=req();Object.assign(request.body,{paperDocumentId:9,paperReviewConfirmed:true});const next=vi.fn();await saveSupportClientInsurance(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(writeClientInsurance).not.toHaveBeenCalled();
});
it('saves partial insurance, resets verification, and preserves the billing assignment decision',async()=>{
  const response=res(),next=vi.fn();await saveSupportClientInsurance(req(),response,next);
  expect(next).not.toHaveBeenCalled();
  expect(writeClientInsurance).toHaveBeenCalledWith(expect.objectContaining({clientId:20,agencyId:2,primary:{insurerName:'Updated',memberId:'MEMBER'},verifiedForClaims:false,acceptAssignment:true,confirmedBy:10}));
  expect(response.json.mock.calls[0][0].insurance).not.toHaveProperty('verifiedForClaims');
});
it('stores EHR transition insurance without initiating eligibility or changing the billing assignment decision',async()=>{
  const request=req();request.body.importContext='ehr_transition';
  const next=vi.fn();await saveSupportClientInsurance(request,res(),next);
  expect(next).not.toHaveBeenCalled();
  expect(writeClientInsurance).toHaveBeenCalledWith(expect.objectContaining({queueEligibility:false,verifiedForClaims:false,acceptAssignment:true}));
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

it.each([false,true])('only lets billing recheck a paper policy after submission: finalized=%s',async finalized=>{
 const finalizedAt=finalized?'2026-11-15T12:00:00Z':null;
 readClientInsurance.mockResolvedValue({primary:{},paperReviewRequired:true,paperSourceDocumentId:9,paperFinalizedAt:finalizedAt});
 ClientPhiDocument.findSchoolPaperPacket.mockResolvedValue({id:9,client_id:20,agency_id:2,scan_status:'clean'});pool.execute.mockResolvedValue([[{id:20}]]);
 const request=req();request.params={clientId:20};Object.assign(request.body,{agencyId:2,paperDocumentId:9,checkCoverage:true});const next=vi.fn();
 await saveClientInsurance(request,res(),next);expect(next).not.toHaveBeenCalled();expect(writeClientInsurance.mock.calls.at(-1)[0]).toMatchObject({queueEligibility:finalized,paperFinalization:finalized?{documentId:9,finalizedAt}:null,confirmedBy:10});
});
