import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),auditBilling:vi.fn()}));
import {buildEligibilityRequest,summarizeEligibility,validateCoverageReview,coverageFingerprint,coverageReviewBlockers,runCoverageCheck,assertCoverageCollectionSafe} from '../coverageVerification.service.js';
import {decryptFamilyBilling} from '../familyBillingEncryption.service.js';
const insurance=()=>({primary:{payerId:'TEST',insurerName:'Test Insurance',memberId:'SYNTHETIC',subscriberFirstName:'Parent',subscriberLastName:'Test',subscriberDob:'1980-02-01',subscriberSex:'F',relationshipToSubscriber:'child'},patient:{firstName:'Child',lastName:'Test',dateOfBirth:'2010-03-01',sex:'M'}});
const profile={officeId:8,billingNpi:'1306688650',practice:{tax_id:'123456789',name:'Synthetic Agency'}};
beforeEach(()=>{vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));});
describe('client-scoped eligibility and other coverage',()=>{
 it('uses the selected policy, dependent identity, billing office and visit date',()=>{
  const info=insurance();info.secondary={...info.primary,payerId:'SECOND',memberId:'SECOND-MEMBER'};
  expect(buildEligibilityRequest({insurance:info,slot:'secondary',serviceDate:'2026-09-24',profile})).toMatchObject({payerid:'SECOND',ins_number:'SECOND-MEMBER',pat_rel:'G8',pat_name_f:'Child',ins_name_f:'Parent',pat_dob:'20100301',ins_dob:'19800201',fdos:'20260924',service_code:'30,MH',prov_npi:'1306688650',prov_taxid:'123456789'});
 });
 it('uses a separately configured eligibility payer ID without changing the claims destination',()=>{const info=insurance();info.primary.eligibilityPayerId='ELIGTEST';expect(buildEligibilityRequest({insurance:info,slot:'primary',serviceDate:'2026-09-24',profile}).payerid).toBe('ELIGTEST');expect(info.primary.payerId).toBe('TEST');});
 it('rejects missing dependent identity, invalid dates, missing policies and invalid NPI',()=>{
  for(const overrides of [{slot:'tertiary'},{slot:'secondary'},{serviceDate:'2026-02-30'},{profile:{...profile,billingNpi:'1234567890'}},{insurance:{...insurance(),patient:{}}}])expect(()=>buildEligibilityRequest({insurance:insurance(),slot:'primary',serviceDate:'2026-09-24',profile,...overrides})).toThrow();
 });
 it('distinguishes reported plan activity from other coverage and ambiguous benefits',()=>{
  const benefit=[{benefit_code:'30',benefit_coverage_code:'1'},{benefit_code:'MH',benefit_coverage_code:'R',entity_name:'Other carrier'}];
  expect(summarizeEligibility({elig:{benefit}})).toMatchObject({status:'active_reported',otherCoverageReported:true});
  expect(summarizeEligibility({elig:{benefit:benefit[0]}})).toMatchObject({otherCoverageReported:false,warning:expect.stringContaining('does not establish')});
  expect(summarizeEligibility({elig:{benefit:[...benefit,{benefit_code:'30',benefit_coverage_code:'6'}]}}).status).toBe('review_required');
  expect(summarizeEligibility({elig:{benefit:{benefit_code:'MH',benefit_coverage_code:'1'}}}).status).toBe('review_required');
 });
 it('requires checking secondary and Medicaid TPL; rejects Medicaid-first commercial coverage',()=>{
  const info=insurance();info.secondary={...info.primary,isMedicaid:true};
  const input={status:'verified',source:'payer_portal',reference:'Portal reference 123',primaryChecked:true,secondaryChecked:true,otherCoverageChecked:true,orderConfirmed:true,medicaidTplChecked:true};
  expect(()=>validateCoverageReview(input,info)).not.toThrow();
  for(const k of ['secondaryChecked','otherCoverageChecked','medicaidTplChecked','orderConfirmed'])expect(()=>validateCoverageReview({...input,[k]:false},info)).toThrow();
  expect(()=>validateCoverageReview(input,{primary:info.secondary,secondary:info.primary})).toThrow(/payer order/);
 });
 it('holds missing, stale, changed, unresolved and newly completed evidence',()=>{
  const info=insurance(),review={status:'verified',insurance_fingerprint:coverageFingerprint(info),through_check_id:8,created_at:'2026-09-24T12:00:00Z'},base={insurance:info,review,latestCheckId:8,now:new Date('2026-09-25T12:00:00Z')};
  expect(coverageReviewBlockers(base)).toEqual([]);
  for(const change of [{review:null},{review:{...review,status:'unresolved'}},{latestCheckId:9},{review:{...review,has_new_evidence:1}},{now:new Date('2026-10-10')},{insurance:{...info,patient:{...info.patient,firstName:'Changed'}}}])expect(coverageReviewBlockers({...base,...change}).length).toBeGreaterThan(0);
 });
 it('saves encrypted response evidence without exposing API credentials',async()=>{
  const db={execute:vi.fn().mockResolvedValue([{insertId:10}])},request=vi.fn().mockResolvedValue({elig:{ins_name_f:'PRIVATE NAME',benefit:{benefit_code:'30',benefit_coverage_code:'1'}}});
  const result=await runCoverageCheck({agencyId:1,clientId:2,slot:'primary',serviceDate:'2026-09-24',requestKey:'unique-test-request',actorUserId:5,profile,accountKey:'SYNTHETIC-KEY'},{db,request,readInsurance:async()=>insurance()});
  expect(result.summary.status).toBe('active_reported');const stored=db.execute.mock.calls[1][1][0];expect(stored).not.toMatch(/PRIVATE NAME|SYNTHETIC-KEY/);expect(decryptFamilyBilling(stored,'coverage:1:2').result.elig.ins_name_f).toBe('PRIVATE NAME');
  expect(()=>decryptFamilyBilling(stored,'coverage:9:2')).toThrow();expect(db.execute.mock.calls[1][0]).toContain('completed_at=CURRENT_TIMESTAMP(6)');
 });
 it('does not repeat an eligibility request with an existing key',async()=>{
  const db={execute:vi.fn().mockRejectedValue({code:'ER_DUP_ENTRY'})},request=vi.fn();
  await expect(runCoverageCheck({agencyId:1,clientId:2,slot:'primary',serviceDate:'2026-09-24',requestKey:'duplicate-request',actorUserId:5,profile,accountKey:'test'},{db,request,readInsurance:async()=>insurance()})).rejects.toMatchObject({status:409});expect(request).not.toHaveBeenCalled();
 });
 it('pauses collection when a response arrives after the reviewer signed off',async()=>{
  const db={execute:vi.fn().mockResolvedValueOnce([[{latest_check_id:8}]]).mockResolvedValueOnce([[{status:'verified',through_check_id:8,has_new_evidence:1}]])};await expect(assertCoverageCollectionSafe(1,2,db)).rejects.toMatchObject({status:409});
 });
});
