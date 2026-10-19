import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),create:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:mocks.getConnection}}));
vi.mock('../../models/Task.model.js',()=>({default:{create:mocks.create}}));
vi.mock('../../models/AgencyClaimMdCredentials.model.js',()=>({default:{}}));
import {insuranceIdentityIssue,queueInsuranceVerificationTask} from '../insuranceVerificationTask.service.js';
import {requireClaimMdEligibility,requireClaimMdTransmission} from '../claimMdConnection.service.js';
describe('insurance exceptions in a shared billing queue',()=>{
 let existing;
 beforeEach(()=>{
  vi.clearAllMocks();existing=null;
  mocks.getConnection.mockResolvedValue({execute:vi.fn(async()=>[[{acquired:1}]]),release:vi.fn()});
  mocks.execute.mockImplementation(async sql=>{
   if(sql.includes('feature_flags'))return [[{feature_flags:{insuranceVerificationTasks:{enabled:true,taskListId:15,ownerUserId:501}}}]];
   if(sql.includes('FROM task_lists'))return [[{id:15}]];
   if(sql.includes('FROM clients'))return [[{id:20,initials:'SAMPLE'}]];
   if(sql.includes('FROM tasks'))return [existing?[existing]:[]];
   return [{affectedRows:1}];
  });
  mocks.create.mockImplementation(async()=>{existing={id:90,status:'pending'};return existing;});
 });
 it('creates an encrypted, claimable task with no invented subscriber identity',async()=>{
  const id=await queueInsuranceVerificationTask({agencyId:2,clientId:20,reason:'missing_member_id'});
  expect(id).toBe(90);expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({taskListId:15,assignedToUserId:null,assignedToAgencyId:2,encryptDescription:true,sourceRefType:'insurance_verification',metadata:expect.objectContaining({clientId:20,reason:'missing_member_id'})}));
 });
 it('keeps one task across repeated failures without resetting its owner or in-progress status',async()=>{
  await queueInsuranceVerificationTask({agencyId:2,clientId:20,reason:'missing_member_id'});existing.status='in_progress';
  expect(await queueInsuranceVerificationTask({agencyId:2,clientId:20,reason:'subscriber_not_found',coverageCheckId:4})).toBe(90);
  expect(mocks.create).toHaveBeenCalledTimes(1);const update=mocks.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE tasks'));
  expect(update[0]).not.toContain('assigned_to_user_id');expect(update[0]).toContain("IF(status IN ('completed','overridden'),'pending',status)");
 });
 it('does not create a task in a list belonging to another tenant',async()=>{
  const original=mocks.execute.getMockImplementation();mocks.execute.mockImplementation(async sql=>sql.includes('FROM task_lists')?[[]]:original(sql));
  await expect(queueInsuranceVerificationTask({agencyId:2,clientId:20,reason:'missing_member_id'})).rejects.toThrow('scope');expect(mocks.create).not.toHaveBeenCalled();
 });
 it('distinguishes missing identifiers and identity from payer routing',()=>{
  expect(insuranceIdentityIssue({})).toBe('missing_member_id');
  const insurance={primary:{memberId:'SYNTHETIC',subscriberFirstName:'Test',subscriberLastName:'Member',subscriberDob:'2000-01-01',relationshipToSubscriber:'self'}};
  expect(insuranceIdentityIssue(insurance)).toBe('missing_payer');
  expect(insuranceIdentityIssue({...insurance,primary:{...insurance.primary,relationshipToSubscriber:'child'}})).toBe('missing_identity');
 });
 it('allows separately enabled eligibility while claims stay disabled',()=>{
  const connection={mode:'disabled'};
  expect(()=>requireClaimMdEligibility(connection,2,{CLAIM_MD_ELIGIBILITY_MODE_2:'live'})).not.toThrow();
  expect(()=>requireClaimMdEligibility(connection,6,{CLAIM_MD_ELIGIBILITY_MODE_2:'live'})).toThrow('disabled');
  expect(()=>requireClaimMdTransmission(connection)).toThrow('disabled');
 });
});
