import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),positiveId:Number,auditBilling:vi.fn()}));
import { eligibilityProfileRecord, enrichInsuranceFromEligibility, applyEligibilityProfileResults } from '../eligibilityProfile.service.js';
import { mergeMissingBillingDemographics } from '../insuranceDemographicsAutomation.service.js';
import { buildEligibilityRequest, eligibilityIdentityMatches, coverageReviewBlockers, coverageFingerprint } from '../coverageVerification.service.js';
import { needsMedicaidDiscovery, intakeEligibilityInputs, automaticEligibilityPayerReady } from '../intakeEligibility.service.js';
import { buildClaimMdJsonClaim } from '../claimMd.service.js';

const patient={firstName:'Test',lastName:'Member',dateOfBirth:'2010-01-02',state:'CO'};
const profile={billingNpi:'1306688650',practice:{tax_id:'123456789',name:'Synthetic'}};
const evidence=()=>({id:7,eligibilityPayerId:'SKCO0',summary:{status:'active_reported',identityMatches:true},result:{elig:{ins_name_f:'Test',ins_name_l:'Member',ins_dob:'20100102',ins_number:'SYNTHETIC',group_number:'TESTGROUP',plan_begin_date:'20260101',benefit:[{benefit_code:'30',benefit_coverage_code:'1'},{benefit_code:'30',benefit_coverage_code:'U',entity_name:'Other insurer',entity_policy:'TEST-POLICY',extra_payer_field:{keep:'all fields'}}]}}});
describe('eligibility import into billing profile',()=>{
 it('keeps all returned other-insurance details without assigning payer order or assuming a route',()=>{
  const raw=evidence(),record=eligibilityProfileRecord({id:7,policy_slot:'primary',service_date:'2026-11-10'},raw);
  expect(record.otherCoverageReported).toBe(true);
  expect(record.otherInsurers[0]).toMatchObject({entity_name:'Other insurer',entity_policy:'TEST-POLICY',extra_payer_field:{keep:'all fields'}});
  expect(record.response).toEqual(raw.result);expect(record).not.toHaveProperty('secondary');
  expect(eligibilityProfileRecord({}, {...raw,eligibilityPayerId:'60054'}).otherInsurers).toEqual([]);
 });
 it('populates missing fields after an exact match without overwriting entered values or inventing a billing route',()=>{
  const insurance={primary:{groupNumber:'STAFF'},patient};
  const next=enrichInsuranceFromEligibility(insurance,[{slot:'primary',result:evidence()}]);
  expect(next.primary).toMatchObject({memberId:'SYNTHETIC',groupNumber:'STAFF',eligibilityPayerId:'SKCO0',isMedicaid:true,effectiveDate:'2026-01-01'});
  expect(next.primary).not.toHaveProperty('payerId');expect(insurance.primary).toEqual({groupNumber:'STAFF'});
 });
 it.each([{identityMatches:false,status:'active_reported'},{identityMatches:null,status:'active_reported'},{identityMatches:true,status:'inactive_reported'}])('does not apply unverified results %j',summary=>{
  const insurance={primary:{},patient};expect(enrichInsuranceFromEligibility(insurance,[{slot:'primary',result:{...evidence(),summary}}])).toEqual(insurance);
 });
 it('retains a conflicting saved member ID for reconciliation without importing other fields',()=>{
  const insurance={primary:{memberId:'DIFFERENT'},patient};expect(enrichInsuranceFromEligibility(insurance,[{slot:'primary',result:evidence()}])).toEqual(insurance);
 });
 it('imports both policies together and does not promote a dependent into the subscriber',()=>{
  const first=evidence(),second={...evidence(),eligibilityPayerId:'60054',result:{elig:{ins_number:'PARENT-ID',ins_name_f:'Parent',ins_name_l:'Member',ins_dob:'19800101'}}};
  const next=enrichInsuranceFromEligibility({primary:{relationshipToSubscriber:'child'},secondary:{},patient},[{slot:'primary',result:second},{slot:'secondary',result:first}]);
  expect(next.primary).toMatchObject({memberId:'PARENT-ID',subscriberFirstName:'Parent',relationshipToSubscriber:'child'});
  expect(next.secondary.memberId).toBe('SYNTHETIC');
 });
 it('declines an import when staff changes insurance while the request is in flight',async()=>{
  const db={beginTransaction:vi.fn(),rollback:vi.fn(),commit:vi.fn(),release:vi.fn(),execute:vi.fn().mockResolvedValue([[{id:8}]])},writeInsurance=vi.fn();
  expect(await applyEligibilityProfileResults({agencyId:2,clientId:8,expectedFingerprint:'old',results:[{slot:'primary',result:evidence()}]},{db:{getConnection:async()=>db},readInsurance:async()=>({primary:{memberId:'NEW'}}),writeInsurance})).toBe(false);
  expect(writeInsurance).not.toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
 });
 it('imports under a tenant/client lock with no recursive inquiry or claims verification',async()=>{
  const insurance={primary:{},patient};const db={beginTransaction:vi.fn(),rollback:vi.fn(),commit:vi.fn(),release:vi.fn(),execute:vi.fn().mockResolvedValue([[{id:8}]])},writeInsurance=vi.fn();
  await applyEligibilityProfileResults({agencyId:2,clientId:8,expectedFingerprint:coverageFingerprint(insurance),results:[{slot:'primary',result:evidence()}],actorUserId:9},{db:{getConnection:async()=>db},readInsurance:async()=>insurance,writeInsurance});
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('agency_id=? FOR UPDATE'),[8,2]);
  expect(writeInsurance).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:8,verifiedForClaims:false,queueEligibility:false,primary:expect.objectContaining({memberId:'SYNTHETIC'})}),db);
 });
});
describe('complete the missing demographic and discover Medicaid',()=>{
 it('does not combine conflicting chart and billing identities',()=>{
  expect(mergeMissingBillingDemographics({patient:{firstName:'Different',lastName:'Member'}},patient)).toEqual({firstName:'Different',lastName:'Member'});
 });
 it('requires eligibility enrollment for the exact agency, account, office, NPI and tax identity',async()=>{
  const db={execute:vi.fn().mockResolvedValue([[{directory_snapshot_json:{eligibility:'enrollment'}}]])},clinicalDb={execute:vi.fn().mockResolvedValue([[{status:'started'}]])};
  const input={agencyId:2,payerId:'04102',profile:{...profile,officeId:6},connection:{connectionId:'account:test'}};
  expect(await automaticEligibilityPayerReady(input,{db,clinicalDb})).toBe(false);
  clinicalDb.execute.mockResolvedValue([[{status:'approved'}]]);
  expect(await automaticEligibilityPayerReady(input,{db,clinicalDb})).toBe(true);
  expect(clinicalDb.execute.mock.calls[0][1]).toEqual([2,'account:test',6,'04102','1306688650',expect.stringMatching(/^[a-f0-9]{64}$/)]);
  db.execute.mockResolvedValue([[{directory_snapshot_json:{eligibility:'no'}}]]);clinicalDb.execute.mockClear();
  expect(await automaticEligibilityPayerReady(input,{db,clinicalDb})).toBe(false);expect(clinicalDb.execute).not.toHaveBeenCalled();
 });
 it('waits for all three identity fields, with or without a member ID',()=>{
  for(const primary of [{},{isMedicaid:true},{isMedicaid:true,memberId:'SYNTHETIC'}]) {
   const partial={primary,patient:{firstName:'Test',lastName:'Member'}};
   expect(intakeEligibilityInputs(partial,{medicaidState:'CO'},profile,'2026-11-10').readySlots).toEqual([]);
   const filled={...partial,patient:mergeMissingBillingDemographics(partial,patient)};
   expect(intakeEligibilityInputs(filled,{medicaidState:'CO'},profile,'2026-11-10').readySlots).toEqual(['primary']);
  }
 });
 it('does not search Colorado for another state or an existing commercial policy',()=>{
  expect(needsMedicaidDiscovery({primary:{},patient},{medicaidState:'CO'})).toBe(true);
  expect(needsMedicaidDiscovery({primary:{insurerName:'Aetna'},patient},{medicaidState:'CO'})).toBe(false);
  expect(needsMedicaidDiscovery({primary:{},patient:{...patient,state:'AZ'}},{medicaidState:'CO'})).toBe(false);
  const request=buildEligibilityRequest({insurance:{primary:{},patient},slot:'primary',profile,serviceDate:'2026-11-10',medicaidDiscovery:true});
  expect(request).toMatchObject({payerid:'SKCO0',ins_dob:'20100102'});expect(request).not.toHaveProperty('ins_number');
 });
 it('requires subscriber and dependent identity for commercial auto-imports',()=>{
  const payload={payerid:'60054',pat_rel:'G8',ins_number:'TEST',ins_name_f:'Parent',ins_name_l:'Member',ins_dob:'19800101',pat_name_f:'Test',pat_name_l:'Member',pat_dob:'20100102'};
  expect(eligibilityIdentityMatches(payload,{elig:{...payload}})).toBe(true);
  expect(eligibilityIdentityMatches(payload,{elig:{...payload,pat_dob:''}})).toBeNull();
  expect(eligibilityIdentityMatches(payload,{elig:{...payload,pat_name_l:'Different'}})).toBe(false);
 });
 it('blocks Medicaid-first claims at readiness and payload generation even with a saved review',()=>{
  const insurance={primary:{isMedicaid:true},secondary:{insurerName:'Commercial'},patient};
  expect(coverageReviewBlockers({insurance,review:{status:'verified'}})[0]).toContain('Medicaid cannot be billed first');
  expect(()=>buildClaimMdJsonClaim({},[],{insurance})).toThrow('Medicaid cannot be billed first');
  // A linked secondary claim proceeds to the existing required-field/adjudication checks.
  expect(()=>buildClaimMdJsonClaim({payer_sequence:2},[],{insurance})).toThrow('Claim is incomplete');
 });
});
