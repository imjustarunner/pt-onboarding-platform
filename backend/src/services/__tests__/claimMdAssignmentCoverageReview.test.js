import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),auditBilling:vi.fn()}));
import {assignmentInsuranceSummary,assignmentCoverageIssues,coverageFingerprint,coverageReviewToken,saveCoverageReview} from '../coverageVerification.service.js';
import {evaluateCoverageAdmission} from '../clientCoverageAdmission.service.js';
import {claimInsuranceIssues} from '../clientInsurance.service.js';
import {decryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {auditBilling} from '../familyBillingPolicy.service.js';

const serviceDate='2026-11-03',now=new Date('2026-11-03T19:00:00Z');
const policy=()=>({insurerName:'Synthetic Medicaid',memberId:'D123456',isMedicaid:true,effectiveDate:'2026-01-01',terminationDate:'2026-12-31'});
const insurance=()=>({primary:policy(),secondary:null,patient:{firstName:'DEMO QA',lastName:'Student',dateOfBirth:'2015-01-02'}});
const snapshot=()=>({checks:[],latestCheckId:8,latestEvidenceAt:'2026-11-03T18:30:00.123456',latestReview:{id:5,status:'unresolved'}});
function setup({currentInsurance=insurance(),evidence=snapshot(),clientExists=true}={}) {
 const insertions=[];
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,values)=>{
  if(sql.startsWith('SELECT id FROM clients'))return [clientExists?[{id:10}]:[]];
  if(sql.startsWith('INSERT INTO client_coverage_reviews')){insertions.push(values);return [{insertId:17}];}
  throw Error(`Unexpected SQL: ${sql}`);
 })};
 const readInsurance=vi.fn(async()=>currentInsurance),listEvidence=vi.fn(async()=>evidence);
 const input={agencyId:2,clientId:10,actorUserId:559,serviceDate,status:'verified',source:'payer_portal',reference:'Synthetic portal checked today',assignmentReview:true,
  primaryChecked:true,secondaryChecked:false,otherCoverageChecked:true,orderConfirmed:true,medicaidTplChecked:true,
  reviewToken:coverageReviewToken({agencyId:2,clientId:10,serviceDate,insurance:currentInsurance,...evidence})};
 return {input,db,insertions,deps:{pool:{getConnection:async()=>db},readInsurance,listEvidence}};
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));});

describe('manual assignment coverage review',()=>{
 it('records an attributed encrypted manual verification and clears admission without requiring clearinghouse fields',async()=>{
  const state=setup();
  expect(await saveCoverageReview(state.input,state.deps)).toEqual({id:17,status:'verified'});
  const values=state.insertions[0],saved={id:17,status:values[4],insurance_fingerprint:values[3],through_check_id:values[5],created_at:now};
  expect(decryptFamilyBilling(values[6],'coverage:2:10')).toMatchObject({source:'payer_portal',reference:state.input.reference,primaryChecked:true,otherCoverageChecked:true,orderConfirmed:true,medicaidTplChecked:true,reviewPurpose:'provider_assignment',reviewToken:state.input.reviewToken});
  expect(values[7]).toBe(559);expect(values[6]).not.toContain(state.input.reference);
  expect(auditBilling).toHaveBeenCalledWith({agencyId:2,clientId:10,userId:559,action:'insurance_coordination_reviewed',objectId:17},state.db);
  expect(evaluateCoverageAdmission({client:{client_type:'school'},agency:{feature_flags:{medicalBillingEnabled:true}},insurance:insurance(),review:saved,latestCheckId:8,now}).ready).toBe(true);
  expect(claimInsuranceIssues(insurance().primary)).toContain('Claim.MD payer ID is missing');
  expect(state.db.commit).toHaveBeenCalledOnce();expect(state.db.rollback).not.toHaveBeenCalled();
 });
 it('keeps phone verification available without a billing office or paid electronic lookup',async()=>{
  const state=setup();state.input.source='payer_phone';
  await expect(saveCoverageReview(state.input,state.deps)).resolves.toMatchObject({status:'verified'});
  expect(state.deps.readInsurance).toHaveBeenCalledWith(10,2,state.db);
 });
 it.each(['insurance','review','new check','completed check','wrong client','wrong agency','wrong date','missing token'])('rejects a stale or mismatched review token: %s',async(change)=>{
  const state=setup();
  if(change==='insurance')state.deps.readInsurance.mockResolvedValue({...insurance(),primary:{...policy(),memberId:'D654321'}});
  if(change==='review')state.deps.listEvidence.mockResolvedValue({...snapshot(),latestReview:{id:6,status:'verified'}});
  if(change==='new check')state.deps.listEvidence.mockResolvedValue({...snapshot(),latestCheckId:9});
  if(change==='completed check')state.deps.listEvidence.mockResolvedValue({...snapshot(),latestEvidenceAt:'2026-11-03T18:31:00.123457'});
  if(change==='wrong client')state.input.clientId=11;
  if(change==='wrong agency')state.input.agencyId=3;
  if(change==='wrong date')state.input.serviceDate='2026-11-04';
  if(change==='missing token')delete state.input.reviewToken;
  await expect(saveCoverageReview(state.input,state.deps)).rejects.toMatchObject({status:409,code:'COVERAGE_REVIEW_STALE',message:expect.stringContaining('changed')});
  expect(state.insertions).toHaveLength(0);expect(state.db.rollback).toHaveBeenCalledOnce();expect(state.db.commit).not.toHaveBeenCalled();
 });
 it('rejects an out-of-scope client before reading or saving policy evidence',async()=>{
  const state=setup({clientExists:false});
  await expect(saveCoverageReview(state.input,state.deps)).rejects.toMatchObject({status:404});
  expect(state.deps.readInsurance).not.toHaveBeenCalled();expect(state.insertions).toHaveLength(0);expect(auditBilling).not.toHaveBeenCalled();
 });
 it.each(['primaryChecked','otherCoverageChecked','orderConfirmed','medicaidTplChecked'])('never assumes the required %s attestation',async key=>{
  const state=setup();state.input[key]=false;
  await expect(saveCoverageReview(state.input,state.deps)).rejects.toMatchObject({status:409});expect(state.insertions).toHaveLength(0);
 });
 it('requires the secondary policy and its own attestation when recorded',async()=>{
  const info={...insurance(),primary:{insurerName:'Synthetic commercial',memberId:'COMMERCIAL-1'},secondary:policy()},state=setup({currentInsurance:info});
  await expect(saveCoverageReview(state.input,state.deps)).rejects.toMatchObject({status:409});
  state.input.secondaryChecked=true;
  await expect(saveCoverageReview(state.input,state.deps)).resolves.toMatchObject({status:'verified'});
  const missing=setup({currentInsurance:{...info,secondary:{...policy(),memberId:''}}});missing.input.secondaryChecked=true;
  await expect(saveCoverageReview(missing.input,missing.deps)).rejects.toMatchObject({status:409,message:'Secondary member ID is missing'});
 });
 it('shows missing saved coverage and effective-date issues separately from claim readiness',()=>{
  expect(assignmentCoverageIssues(insurance(),serviceDate)).toEqual([]);
  expect(assignmentCoverageIssues(null,serviceDate)).toEqual(['Primary insurance carrier is missing','Primary member ID is missing']);
  expect(assignmentCoverageIssues({primary:{...policy(),effectiveDate:'2026-11-04'}},serviceDate)).toEqual(['Primary coverage starts after the verification date']);
  expect(assignmentCoverageIssues({primary:{...policy(),terminationDate:'2026-11-02'}},serviceDate)).toEqual(['Primary coverage ended before the verification date']);
  expect(assignmentInsuranceSummary(insurance())).toEqual({patientName:'DEMO QA Student',primary:{insurerName:'Synthetic Medicaid',memberId:'D123456'},secondary:null,hasMedicaidCoverage:true});
 });
 it('rejects expired policies even when all attestations are selected',async()=>{
  const state=setup({currentInsurance:{...insurance(),primary:{...policy(),terminationDate:'2026-11-02'}}});
  await expect(saveCoverageReview(state.input,state.deps)).rejects.toMatchObject({status:409,message:'Primary coverage ended before the verification date'});
  expect(state.insertions).toHaveLength(0);
 });
 it('continues requiring returned active evidence for a ClaimMD-based review',async()=>{
  const state=setup();state.input.source='claimmd';
  await expect(saveCoverageReview(state.input,state.deps)).rejects.toMatchObject({status:409,message:expect.stringContaining('Check each current policy')});
  expect(state.insertions).toHaveLength(0);
 });
 it('does not let an insurance-editor claim checkbox replace the dated coverage review',()=>{
  expect(evaluateCoverageAdmission({client:{client_type:'school'},agency:{feature_flags:{medicalBillingEnabled:true}},insurance:{...insurance(),verifiedForClaims:true},review:null,now}).ready).toBe(false);
  expect(coverageFingerprint(insurance())).toBe(coverageFingerprint({...insurance(),verifiedForClaims:true}));
 });
});
