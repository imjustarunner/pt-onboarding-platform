import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),positiveId:Number,auditBilling:vi.fn()}));
import {intakeLookupModes,shouldTryDemographics,intakeEligibilityKey,coloradoEligibilityPolicy,processIntakeEligibility,runIntakeEligibilityJobs} from '../intakeEligibility.service.js';
import {coverageFingerprint} from '../coverageVerification.service.js';
const insurance={primary:{isMedicaid:true,eligibilityPayerId:'SKCO0',memberId:'SYNTHETIC'},patient:{firstName:'Test',lastName:'Person',dateOfBirth:'2010-01-01'}};
const job={id:1,agency_id:2,client_id:3,insurance_fingerprint:coverageFingerprint(insurance)};
function deps(){return {db:{execute:vi.fn().mockResolvedValue([[]])},configurePayers:async()=>insurance,connection:async()=>({mode:'live'}),profile:async()=>({}),check:vi.fn(),saveMember:vi.fn(),queueTask:vi.fn(),env:{}};}
describe('intake eligibility',()=>{
 it('supports name and DOB only for configured Colorado Medicaid',()=>{
  expect(intakeLookupModes(insurance,'primary')).toEqual(['member_id','demographics']);
  expect(intakeLookupModes({...insurance,primary:{...insurance.primary,memberId:''}},'primary')).toEqual(['demographics']);
  expect(intakeLookupModes({primary:{payerId:'OTHER'}},'primary')).toEqual(['member_id']);
  expect(coloradoEligibilityPolicy({isMedicaid:true,insurerName:'Health First Colorado'}, {}, {medicaidState:'CO'}).eligibilityPayerId).toBe('SKCO0');
  expect(coloradoEligibilityPolicy({isMedicaid:true,insurerName:'Another state Medicaid'}, {state:'AZ'}, {medicaidState:'CO'}).eligibilityPayerId).toBeUndefined();
 });
 it('uses demographic fallback only after an explicit subscriber-not-found result',()=>{
  expect(shouldTryDemographics({summary:{payerErrors:[{error_code:'75'}]}})).toBe(true);
  for(const summary of [{},{payerErrors:[]},{payerErrors:[{error_code:'75'},{error_code:'42'}]}])expect(shouldTryDemographics({summary})).toBe(false);
 });
 it('deduplicates by tenant/client/current coverage and lookup mode without identifiers',()=>{
  const input={agencyId:2,clientId:3,fingerprint:'a',slot:'primary',mode:'member_id'};
  expect(intakeEligibilityKey(input)).toBe(intakeEligibilityKey({...input}));
  for(const patch of [{jobId:9},{agencyId:4},{clientId:5},{fingerprint:'b'},{slot:'secondary'},{mode:'demographics'}])expect(intakeEligibilityKey({...input,...patch})).not.toBe(intakeEligibilityKey(input));
 });
 it('attempts one confirmed-not-found fallback, then retains billing coordination',async()=>{
  const d=deps();d.check.mockResolvedValueOnce({summary:{status:'review_required',payerErrors:[{error_code:'75'}]}}).mockResolvedValueOnce({summary:{status:'active_reported',identityMatches:true}});
  expect(await processIntakeEligibility(job,{reviewer_user_id:9},{officeId:6},d)).toBe('completed');
  expect(d.check.mock.calls.map(([v])=>v.lookupMode)).toEqual(['member_id','demographics']);
  expect(d.check.mock.calls.every(([v])=>v.source==='automatic'&&v.expectedFingerprint===coverageFingerprint(insurance))).toBe(true);
  expect(d.queueTask).toHaveBeenCalledWith(expect.objectContaining({reason:'coverage_coordination'}),d.db);
 });
 it('never retries a timeout, a prior attempt or an active response with identity mismatch',async()=>{
  const timeout=deps();timeout.check.mockRejectedValue(new Error('Unknown delivery'));
  await expect(processIntakeEligibility(job,{reviewer_user_id:9},{},timeout)).rejects.toThrow();expect(timeout.check).toHaveBeenCalledTimes(1);
  const prior=deps();prior.db.execute.mockResolvedValue([[{id:8}]]);
  expect(await processIntakeEligibility(job,{}, {},prior)).toBe('review_required');expect(prior.check).not.toHaveBeenCalled();
  const mismatch=deps();mismatch.check.mockResolvedValue({summary:{status:'active_reported',identityMatches:false}});
  expect(await processIntakeEligibility(job,{}, {},mismatch)).toBe('review_required');expect(mismatch.check).toHaveBeenCalledTimes(1);
 });
 it('does not process changed insurance or a disabled worker',async()=>{
  const d=deps();d.configurePayers=async()=>null;
  expect(await processIntakeEligibility(job,{}, {},d)).toBe('superseded');expect(d.check).not.toHaveBeenCalled();
  expect(await runIntakeEligibilityJobs(d)).toEqual([]);expect(d.db.execute).not.toHaveBeenCalled();
 });
 it.each([{claimed:true,allowed:true,calls:1},{claimed:false,allowed:true,calls:0},{claimed:true,allowed:false,calls:0}])('requires both current billing access and an exclusive job claim: %j',async({claimed,allowed,calls})=>{
  const d=deps();d.env={CLAIM_MD_INTAKE_ELIGIBILITY_ENABLED:'true'};d.actorAllowed=async()=>allowed;
  const row={...job,reviewer_user_id:9,feature_flags:{medicalBillingEnabled:true,intakeEligibilityAutomation:{enabled:true,officeId:6}}};
  d.db.execute.mockImplementation(async sql=>sql.startsWith('SELECT j.*')?[[row]]:sql.includes("SET status='processing' WHERE id")?[{affectedRows:claimed?1:0}]:sql.startsWith('SELECT')?[[]]:[{}]);
  d.check.mockResolvedValue({summary:{status:'active_reported',identityMatches:true}});
  await runIntakeEligibilityJobs(d);expect(d.check).toHaveBeenCalledTimes(calls);
 });
});
