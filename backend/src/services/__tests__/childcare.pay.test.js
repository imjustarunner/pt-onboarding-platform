import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {calculateChildcarePay,childcareWorkIntervals,childcareSnapshotHash,childcareSnapshotHashMatches,childcareClaimAmount} from '../childcarePay.service.js';
import {normalizeChildcareRatesByBand,nluChildcareRate,NLU_COMPENSATION_POLICY_VERSION} from '../../content/nluCompensationPolicy.js';
import {normalizeContractServiceRoleDetails} from '../../content/contractServiceRoles.js';
import {agreementRateProfile} from '../employmentAgreementPolicy.service.js';
import {nluEmploymentCategoryTerms} from '../../content/nluEmploymentCategoryTerms.js';
import {editCompensationDraft} from '../compensationDraft.service.js';

const at=(hour,minute=0)=>new Date(Date.UTC(2026,10,19,hour,minute)).toISOString();
const punch=(user,type,hour,minute=0,id=hour*10+user)=>({id,user_id:user,punch_type:`clock_${type}`,punched_at:at(hour,minute)});
const attendance=(children,hour,minute=0,version=1)=>({actual_children:children,effective_at:at(hour,minute),version});
const shift={id:8,agency_id:453,timezone:'America/Denver',minimum_hourly_rate:17,wage_floor_jurisdiction:'QA reviewed work location'};
const profile={nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,category:2,level:4,childcareLevel:3,childcareRatesByBand:{1:26,2:31,3:35,4:39}};
const resolveSchedule=async()=>({profile,scheduleId:72,effectiveOn:'2026-11-18'});
const calculate=extra=>calculateChildcarePay({shift,userId:1,punches:[punch(1,'in',23),punch(1,'out',23,30)],attendance:[attendance(3,23)],resolveSchedule,...extra});

describe('childcare actual time, shared staffing and employee overrides',()=>{
 it('uses each of the four actual attendance bands and keeps legacy flat exceptions',()=>{
  for(const band of [1,2,3,4])expect(nluChildcareRate({category:2,level:3,children:band,ratesByBand:profile.childcareRatesByBand}).rate).toBe(profile.childcareRatesByBand[band]);
  expect(nluChildcareRate({category:2,level:3,children:4,individualHourlyRate:29}).rate).toBe(29);
  expect(nluChildcareRate({category:2,level:3,children:4,individualHourlyRate:29,ratesByBand:{4:38}})).toMatchObject({rate:38,rateSource:'individual_band_override'});
  expect(()=>normalizeChildcareRatesByBand({5:34})).toThrow('one through four');
  expect(()=>normalizeChildcareRatesByBand({1:-3})).toThrow('positive');
 });
 it('carries explicit band amounts from contract details to the executed payroll profile',()=>{
  const details=normalizeContractServiceRoleDetails({childcare:{payLevel:3,ratesByBand:{1:'26.50',2:'31',3:'35',4:'39'},compensationTerms:'QA individual schedule'}});
  const terms=nluEmploymentCategoryTerms({row:{category:2,level:4,paySystem:{...profile,indirectRate:18,supportActivityRate:18}},tokens:{CONTRACT_SERVICE_ROLES:['childcare'],CONTRACT_SERVICE_ROLE_DETAILS:details},legal:'QA'});
  expect(terms.schedule.childcareRatesByBand).toEqual({1:26.5,2:31,3:35,4:39});
  expect(terms.compensation).toContain('$26.50');expect(terms.compensation).toContain('$39.00');
  const actual=agreementRateProfile({}, {id:72,effectiveOn:'2026-11-18',data:{schedule:terms.schedule}});
  expect(actual.childcareRatesByBand).toEqual(details.childcare.ratesByBand);
 });
 it('requires new childcare overrides to take effect prospectively and leaves an unchanged prior cutover intact',()=>{
  const draft={effectiveDate:'2026-11-01',schedule:{...profile}},now=new Date('2026-11-12T20:00:00Z');
  expect(()=>editCompensationDraft(draft,{schedule:{childcareRatesByBand:{...profile.childcareRatesByBand,2:33}}},3,{now})).toThrow('prospective');
  const unchanged=editCompensationDraft(draft,{schedule:{childcareRatesByBand:{...profile.childcareRatesByBand}}},3,{now});expect(unchanged.effectiveDate).toBe('2026-11-01');
  const changed=editCompensationDraft(draft,{effectiveDate:'2026-11-21',schedule:{childcareRatesByBand:{...profile.childcareRatesByBand,2:33}}},3,{now});expect(changed.schedule.childcareRatesByBand[2]).toBe(33);expect(draft.schedule.childcareRatesByBand[2]).toBe(31);
 });
 it('keeps tutoring placement separate from the employee’s overall level',()=>{
  const terms=nluEmploymentCategoryTerms({row:{category:2,level:5,paySystem:{...profile,indirectRate:18,supportActivityRate:18}},tokens:{CONTRACT_SERVICE_ROLES:['tutoring'],CONTRACT_SERVICE_ROLE_DETAILS:{tutoring:{payLevel:2}}},legal:'QA'});
  expect(terms.schedule).toMatchObject({level:5,tutoringLevel:2,tutoringVirtualRate:20,tutoringInPersonRate:21});
 });
 it('pays recorded 30 minutes rather than a scheduled three hours',async()=>{
  const result=await calculate({});expect(result).toMatchObject({totalMinutes:30,totalAmount:17.5,reviewRequired:false});
  expect(result.segments[0]).toMatchObject({children:3,caregivers:1,band:3,rate:35,amount:17.5,rateSource:'individual_band_override',scheduleId:72});
 });
 it('divides five shared children by two actually clocked-in caregivers',async()=>{
  const result=await calculate({punches:[punch(1,'in',22),punch(2,'in',22),punch(1,'out',23),punch(2,'out',23)],attendance:[attendance(5,22)]});
  expect(result).toMatchObject({totalMinutes:60,totalAmount:35,reviewRequired:false});
  expect(result.segments[0]).toMatchObject({children:5,caregivers:2,band:3});
 });
 it('splits a late co-provider and a child-count change into their actual intervals',async()=>{
  const result=await calculate({punches:[punch(1,'in',20),punch(2,'in',21),punch(2,'out',22),punch(1,'out',23)],attendance:[attendance(4,20),attendance(2,22,0,2)]});
  expect(result.segments.map(row=>[row.minutes,row.children,row.caregivers,row.band,row.rate])).toEqual([[60,4,1,4,39],[60,4,2,2,31],[60,2,1,2,31]]);
  expect(result.totalAmount).toBe(101);
 });
 it('does not count a scheduled person without a clock-in as an active caregiver',async()=>{
  const result=await calculate({attendance:[attendance(4,23)]});expect(result.segments[0]).toMatchObject({caregivers:1,band:4,rate:39});
 });
 it('retains open punches and refuses to invent an ending or payable amount',async()=>{
  const result=await calculate({punches:[punch(1,'in',23)]});expect(result.totalMinutes).toBe(0);expect(result.totalAmount).toBeNull();expect(result.reviewRequired).toBe(true);expect(result.reasons.join(' ')).toMatch('open clock-in');
 });
 it('keeps no-child preparation at the agreed one-child base and applies a confirmed floor',async()=>{
  const result=await calculate({attendance:[attendance(0,23)],shift:{...shift,minimum_hourly_rate:28}});
  expect(result.segments[0]).toMatchObject({children:0,band:1,rate:28,agreedRate:26,amount:14});
 });
 it('retains work but requires review for missing attendance, unknown wage floors and excessive ratios',async()=>{
  for(const extra of [{attendance:[]},{shift:{...shift,minimum_hourly_rate:null}},{attendance:[attendance(5,23)]},{shift:{...shift,attendance_review_required:1}}]) {
   const result=await calculate(extra);expect(result.totalMinutes).toBe(30);expect(result.reviewRequired).toBe(true);expect(result.totalAmount).toBeNull();
  }
 });
 it('selects the agreement separately on either side of local midnight',async()=>{
  const start='2026-11-20T06:30:00Z',end='2026-11-20T07:30:00Z';
  const resolve=vi.fn(async({asOfDate})=>({profile:{...profile,childcareRatesByBand:{1:asOfDate==='2026-11-19'?26:30}},scheduleId:asOfDate==='2026-11-19'?72:73}));
  const result=await calculate({punches:[{id:1,user_id:1,punch_type:'clock_in',punched_at:start},{id:2,user_id:1,punch_type:'clock_out',punched_at:end}],attendance:[{effective_at:start,actual_children:1,version:1}],resolveSchedule:resolve});
  expect(result.segments.map(row=>[row.minutes,row.rate,row.scheduleId])).toEqual([[30,26,72],[30,30,73]]);expect(result.totalAmount).toBe(28);
 });
 it('requires a non-tampered complete snapshot and exact time for payroll approval',async()=>{
  const snapshot=await calculate({}),claim={payload:{childcareSnapshot:snapshot,childcareSnapshotHash:childcareSnapshotHash(snapshot)}};
  expect(childcareClaimAmount(claim,.5)).toBe(17.5);
  expect(()=>childcareClaimAmount(claim,3)).toThrow('actual childcare time');
  expect(()=>childcareClaimAmount({...claim,payload:{...claim.payload,childcareSnapshot:{...snapshot,totalAmount:900}}})).toThrow('snapshot');
 });
 it('survives JSON storage object-key normalization while preserving ordered work intervals',async()=>{
  const snapshot=await calculate({punches:[punch(1,'in',20),punch(1,'out',22)],attendance:[attendance(3,20),attendance(2,21,0,2)]});
  const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reverse(item)])):value;
  const stored=JSON.parse(JSON.stringify(reverse(snapshot))),hash=childcareSnapshotHash(snapshot);
  expect(childcareSnapshotHash(stored)).toBe(hash);expect(childcareClaimAmount({payload:{childcareSnapshot:stored,childcareSnapshotHash:hash,childcareSnapshotHashVersion:2}})).toBe(66);
  expect(childcareSnapshotHash({...stored,segments:[...stored.segments].reverse()})).not.toBe(hash);
 });
 it('verifies historic unversioned hashes in their original schema order without recomputing approved amounts',async()=>{
  const snapshot=await calculate({}),legacyHash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const stored=Object.fromEntries(Object.entries(snapshot).reverse().map(([key,value])=>[key,key==='segments'?value.map(segment=>Object.fromEntries(Object.entries(segment).reverse())):value]));
  expect(JSON.stringify(stored)).not.toBe(JSON.stringify(snapshot));expect(childcareSnapshotHashMatches(stored,legacyHash)).toBe(true);
  expect(childcareClaimAmount({status:'paid',payload:{childcareSnapshot:stored,childcareSnapshotHash:legacyHash}})).toBe(17.5);
  expect(()=>childcareClaimAmount({payload:{childcareSnapshot:{...stored,totalAmount:999},childcareSnapshotHash:legacyHash}})).toThrow('snapshot');
  expect(childcareSnapshotHashMatches(stored,legacyHash,2)).toBe(false);expect(childcareSnapshotHashMatches(stored,legacyHash,99)).toBe(false);
 });
 it('flags unmatched/overlapping punches instead of paying twice',()=>{
  const result=childcareWorkIntervals([punch(1,'in',20),punch(1,'in',21),punch(1,'out',22)]);
  expect(result.intervals).toHaveLength(1);expect(result.reasons).toHaveLength(1);
 });
});
