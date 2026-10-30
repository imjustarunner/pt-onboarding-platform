import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), create: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/PayrollTimeClaim.model.js', () => ({ default: { create: mocks.create } }));
import { computeLineAmount, applyPaySystemToBreakdown, estimatePay } from '../paySystem.service.js';
import { tutoringSessionQuantities, createTutoringPayrollDraft } from '../tutoringPayroll.service.js';
import { contractServiceRates } from '../contractCompensation.service.js';
import { employmentCategoryLevelTerms } from '../../content/employmentCategoryLevelTerms.js';
import { COMPENSATION_POLICY_VERSION } from '../employmentAgreementPolicy.service.js';
const profile = { category:1, level:1, creditRate:42, creditRateProbation:32,hcodeRate:28,hcodeRateProbation:20,indirectRate:18,supportActivityRate:18,autoIndirectMinutesPerHour:0,compensationPolicyVersion:COMPENSATION_POLICY_VERSION,tierBonus:{1:0,2:2,3:4} };
const line = (p,code,units=4,status={}) => computeLineAmount({rateProfile:{...profile,...p},status,serviceCode:code,quantity:units});
describe('NLU supplemental pay',()=>{
 it.each([18,20.5,23,25.5,28])('pays four tutoring units at $%s plus 10 minutes indirect',rate=>{
  expect(line({tutoringRate:rate},'TUTORING 15 MIN')).toMatchObject({amount:rate,autoIndirectAmount:3,autoIndirectHours:1/6,totalWithAutoIndirect:rate+3});
  expect(line({tutoringRate:rate},'TUTORING 15 MIN',4,{useReducedRates:true})).toMatchObject({amount:rate,autoIndirectAmount:3});
 });
 it('shows exact quarter-hour tutoring rates in contract previews',()=>{
  const rows=contractServiceRates({category:1,level:2,paySystem:{...profile,tutoringRate:20.5}},[{service_code:'TUTORING 15 MIN',category:'direct',pay_divisor:4}]);
  expect(rows[0]).toMatchObject({rate:'$5.125',reduced:'$5.125'});
 });
 it('retains half-cent unit precision until the line total',()=>{
  expect(line({tutoringRate:20.5},'TUTORING 15 MIN',2).amount).toBe(10.25);
  expect(line({tutoringRate:25.5},'TUTORING 15 MIN',2).amount).toBe(12.75);
 });
 it.each([1,2,3,4,5])('keeps Category 1 level %s H2014 at $22 with indirect',level=>{
  expect(line({level,h2014Rate:22},'H2014')).toMatchObject({amount:22,autoIndirectAmount:3,totalWithAutoIndirect:25});
  expect(line({level,h2014Rate:22},'H2014',4,{useReducedRates:true})).toMatchObject({amount:22,autoIndirectAmount:3});
 });
 it('keeps fixed tutoring rates consistent in the calculator at Tier 3',()=>{
  const result=estimatePay({rateProfile:{...profile,tutoringRate:18},status:{tierLevel:3,currentTierLevel:3},lines:[{serviceCode:'TUTORING 15 MIN',quantity:4}]});
  expect(result.summary).toMatchObject({grandTotal:21,totalBonusAmount:0});
 });
 it('preserves other services and profiles without supplemental rates',()=>{
  expect(line({h2014Rate:22},'H0004')).toMatchObject({amount:28,autoIndirectAmount:3});
  expect(line({},'H2014')).toMatchObject({amount:28,autoIndirectAmount:3});
 });
 it('preserves historical H2014 pay and splits a crossing period by service date',()=>{
  const p={...profile,h2014Rate:22,supplementalRatesEffectiveOn:'2026-10-14'};
  expect(line(p,'H2014',4,{asOfDate:'2026-10-13'})).toMatchObject({amount:28,autoIndirectAmount:3});
  const breakdown={H2014:{units:8,category:'direct'}};
  const result=applyPaySystemToBreakdown({breakdown,rateProfile:p,status:{asOfDate:'2026-10-20'},datedUnitsByCode:new Map([['H2014',[{serviceDate:'2026-10-13',units:4},{serviceDate:'2026-10-14',units:4}]]])});
  expect(result.servicePay).toBe(50);
  expect(Object.values(breakdown).filter(r=>r?.rateSource==='pay_system').map(r=>r.amount)).toEqual([28,22]);
  expect(()=>applyPaySystemToBreakdown({breakdown:{H2014:{units:4}},rateProfile:p,status:{}})).toThrow('service dates');
 });
 it('includes school benefits only for an ITSCO school service focus',()=>{
  const row={category:1,level:1,paySystem:profile};
  const make=(slug,focus)=>employmentCategoryLevelTerms({row,agencySlug:slug,tokens:{ROLE_LABEL:'Provider',SERVICE_FOCUS:focus}});
  const office=make('itsco','Office-Based Counseling');
  expect(office.benefits).toMatch(/training/i); expect(office.benefits).toMatch(/health insurance/i);
  expect(office.benefits).not.toMatch(/School support activity hours/);
  expect(make('itsco','Office-Based Counseling; School-Based Counseling').benefits).toMatch(/School Support Hours/);
  expect(make('nlu','School-Based Counseling').benefits).not.toMatch(/School support activity hours/);
 });
});
describe('tutoring session payroll records',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('converts actual time to units without discarding partial units',()=>{
  expect(tutoringSessionQuantities('2026-10-14 15:00:00','2026-10-14 16:00:00')).toEqual({actualMinutes:60,units:4,directHours:1,indirectHours:1/6});
  expect(tutoringSessionQuantities('2026-10-14 15:00:00','2026-10-14 15:10:00').units).toBeCloseTo(2/3);
  expect(()=>tutoringSessionQuantities(null,new Date())).toThrow('actual tutoring');
 });
 function connection(existing=[],metadata={},providerUserId=4){
  const c={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn()};
  c.execute.mockImplementation(async sql=>sql.includes('FROM learning_class_sessions')?[[{id:7,agency_id:2,agency_slug:'nlu',provider_user_id:providerUserId,session_subtype:'tutoring',status:'ended',actual_started_at:'2026-10-14 15:00:00',ends_at:'2026-10-14 16:00:00',metadata_json:metadata}]]:sql.includes('FROM learning_class_session_participants')?[[{user_id:4}]]:[existing.map(row=>({user_id:4,...row}))]);
  return c;
 }
 it('creates separate direct and indirect claims and reuses existing claims on retry',async()=>{
  const c=connection();mocks.create.mockImplementation(async args=>({id:args.payload.part==='direct'?10:11}));
  const result=await createTutoringPayrollDraft(7,9,{getConnection:async()=>c});
  expect(result.claimIds).toEqual([10,11]);expect(mocks.create.mock.calls.map(([c])=>[c.payload.bucket,c.payload.totalMinutes])).toEqual([['direct',60],['indirect',10]]);
  expect(mocks.create.mock.calls[0][0]).toMatchObject({agencyId:2,userId:4,claimDate:'2026-10-14',payload:{units:4}});
  mocks.create.mockClear();
  const retry=connection([{id:10,payload_json:{part:'direct'}},{id:11,payload_json:JSON.stringify({part:'indirect'})}]);
  expect((await createTutoringPayrollDraft(7,9,{getConnection:async()=>retry})).claimIds).toEqual([10,11]);expect(mocks.create).not.toHaveBeenCalled();
 });
 it('rejects a changed presenter without paying a different employee',async()=>{
  const c=connection([],{},5);
  await expect(createTutoringPayrollDraft(7,9,{getConnection:async()=>c})).rejects.toThrow('assigned provider matches its single presenter');
  expect(mocks.create).not.toHaveBeenCalled();expect(c.rollback).toHaveBeenCalledOnce();
 });
 it('checks all employee claims before recreating a completed session after provider reassignment',async()=>{
  const c=connection([{id:10,user_id:5,payload_json:{part:'direct'}}]);
  await expect(createTutoringPayrollDraft(7,9,{getConnection:async()=>c})).rejects.toThrow('before changing its assigned provider');
  expect(mocks.create).not.toHaveBeenCalled();expect(c.rollback).toHaveBeenCalledOnce();
  const query=c.execute.mock.calls.find(([sql])=>sql.includes('FROM payroll_time_claims'));
  expect(query[0]).not.toMatch(/AND user_id=\?/);expect(query[1]).toEqual([2,'7']);
 });
 it('rolls back incomplete claim creation',async()=>{
  const c=connection();mocks.create.mockRejectedValue(new Error('database unavailable'));
  await expect(createTutoringPayrollDraft(7,9,{getConnection:async()=>c})).rejects.toThrow('database unavailable');
  expect(c.rollback).toHaveBeenCalledOnce();expect(c.release).toHaveBeenCalledOnce();
 });
 it('creates Homework Help direct-only claims from an explicit selection',async()=>{
  const c=connection([],{learningServiceCode:'HOMEWORK HELP'});mocks.create.mockResolvedValue({id:12});
  expect(await createTutoringPayrollDraft(7,9,{getConnection:async()=>c})).toMatchObject({claimIds:[12],directHours:1,indirectHours:0});
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.create.mock.calls[0][0].payload).toMatchObject({serviceCode:'HOMEWORK HELP 15 MIN',part:'direct',units:4});
 });
 it('requires reconciliation before switching a session with existing tutoring claims to Homework Help',async()=>{
  const c=connection([{id:10,payload_json:{part:'direct',serviceCode:'TUTORING 15 MIN'}}],{learningServiceCode:'HOMEWORK HELP'});
  await expect(createTutoringPayrollDraft(7,9,{getConnection:async()=>c})).rejects.toThrow('Reconcile the existing payroll claims');
  expect(mocks.create).not.toHaveBeenCalled();expect(c.rollback).toHaveBeenCalledOnce();
 });
});
