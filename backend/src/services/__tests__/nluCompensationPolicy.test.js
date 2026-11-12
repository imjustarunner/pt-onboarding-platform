import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {NLU_COMPENSATION_POLICY_VERSION,nluChildcareRate,nluTutoringRate} from '../../content/nluCompensationPolicy.js';
import {computeLineAmount,estimatePay,applyPaySystemToBreakdown} from '../paySystem.service.js';
import {agreementRateProfile,executedAgreement,COMPENSATION_POLICY_VERSION} from '../employmentAgreementPolicy.service.js';
import {categoriesForAgencySlug} from '../compensationCategories.service.js';
import {renderNluAmendment} from '../../content/nluCompensationAmendment.js';
import {programScheduleTerms} from '../../content/programServiceRates.js';
const profile={nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,category:3,level:3,creditRate:44,hcodeRate:32,hcodeRateProbation:25,indirectRate:22,supportActivityRate:18,autoIndirectMinutesPerHour:10,testingAuthorized:true};
const status={asOfDate:'2026-11-21',useReducedRates:false};
const wageFloor={minimumHourlyRate:15.16,wageFloorJurisdiction:'Colorado; local applicability reviewed'};
const line=(serviceCode,extra={})=>computeLineAmount({rateProfile:profile,status,serviceCode,quantity:999,actualMinutes:90,serviceContext:wageFloor,...extra,serviceContext:{...wageFloor,...extra.serviceContext}});

describe('prospective NLU four-category and service-specific compensation',()=>{
  it('exposes a fourth category only for NLU',()=>{
    expect(Object.keys(categoriesForAgencySlug('nlu'))).toEqual(['1','2','3','4']);
    for(const slug of ['itsco','isi','tisi'])expect(Object.keys(categoriesForAgencySlug(slug))).toEqual(['1','2','3']);
  });
  it('calculates each caregiver separately using actual shared attendance and the rounded-up band',()=>{
    expect(nluChildcareRate({category:1,level:3,children:5,caregivers:2})).toMatchObject({rate:25,childrenPerCaregiver:3,autoIndirectMinutesPerHour:0});
    expect(nluChildcareRate({category:2,level:3,children:5,caregivers:2}).rate).toBe(30);
    for(const category of [2,3,4])for(const level of [3,4,5])expect(nluChildcareRate({category,level,children:4,caregivers:1}).rate).toBe(32);
    expect(nluChildcareRate({category:1,level:1,children:0,caregivers:1}).rate).toBe(17);
    expect(nluChildcareRate({category:1,level:1,minimumHourlyRate:19.29}).rate).toBe(19.29);
    expect(()=>nluChildcareRate({category:1,level:1,children:5,caregivers:1})).toThrow('staffing review');
    expect(()=>nluChildcareRate({category:1,level:1,children:4,caregivers:0})).toThrow('active assigned');
  });
  it('retains independent tutoring placement and delivery-format rates',()=>{
    expect([1,2,3,4,5].map(level=>nluTutoringRate({category:1,level}))).toEqual([17,18,19,20,20]);
    expect(nluTutoringRate({category:2,level:4,format:'virtual'})).toBe(25);
    expect(nluTutoringRate({category:2,level:4,format:'in_person'})).toBe(27);
    expect(()=>nluTutoringRate({category:3,level:4})).toThrow('separately approved');
    expect(nluTutoringRate({category:3,level:4,individualHourlyRate:29})).toBe(29);
  });
  it('pays actual testing evaluation time without CPT-unit rounding or an automatic allowance',()=>{
    expect(line('96130')).toMatchObject({rate:44,amount:66,payHours:1.5,autoIndirectHours:0,totalWithAutoIndirect:66,leaveAdminRatio:0});
    expect(line('96136')).toMatchObject({rate:32,amount:48,autoIndirectHours:.25,autoIndirectAmount:5.5,totalWithAutoIndirect:53.5});
    expect(line('98966',{actualMinutes:7})).toMatchObject({amount:3.73,autoIndirectAmount:.43});
    expect(()=>line('96130',{actualMinutes:null})).toThrow('actual work minutes');
    expect(()=>line('96130',{rateProfile:{...profile,testingAuthorized:false}})).toThrow('documented instrument');
  });
  it('uses recorded childcare minutes, attendance and the approved service level',()=>{
    const rateProfile={...profile,category:1,level:5,childcareLevel:3};
    expect(line('CHILDCARE',{rateProfile,actualMinutes:45,serviceContext:{children:5,caregivers:2}})).toMatchObject({rate:25,amount:18.75,totalWithAutoIndirect:18.75,autoIndirectAmount:0});
    expect(()=>line('CHILDCARE',{rateProfile,serviceContext:{}})).toThrow('actual child attendance');
    expect(()=>line('CHILDCARE',{rateProfile:{...rateProfile,childcareLevel:null}})).toThrow('separately approved childcare');
  });
  it('requires work-location wage-floor review and raises both direct and automatic indirect rates',()=>{
    const rateProfile={...profile,category:1,tutoringLevel:1,indirectRate:18,tutoringRate:null};
    expect(()=>computeLineAmount({rateProfile,status,serviceCode:'TUTORING VIRTUAL',quantity:1,actualMinutes:60})).toThrow('work-location wage floor');
    expect(line('TUTORING VIRTUAL',{rateProfile,actualMinutes:60,serviceContext:{minimumHourlyRate:19.29,wageFloorJurisdiction:'Denver'}})).toMatchObject({rate:19.29,amount:19.29,autoIndirectRate:19.29,autoIndirectAmount:3.22,totalWithAutoIndirect:22.51,wageFloorJurisdiction:'Denver'});
    expect(()=>line('TUTORING VIRTUAL',{rateProfile,serviceContext:{minimumHourlyRate:0}})).toThrow('work-location wage floor');
  });
  it('honors the same explicit childcare override displayed in the signed amendment',()=>{
    const schedule={...profile,category:2,childcareLevel:3,childcareHourlyRate:31,supportRate:18};
    const data={employee:{name:'Review Person',originalAgreementDate:'2025-01-01'},effectiveDate:'2026-11-21',schedule};
    expect(renderNluAmendment(data)).toContain('1 child: $31.00');
    const actualProfile=agreementRateProfile(profile,{id:21,effectiveOn:'2026-11-21',data});
    expect(actualProfile.childcareRate).toBe(31);
    expect(line('CHILDCARE',{rateProfile:actualProfile,actualMinutes:60,serviceContext:{children:1,caregivers:1}})).toMatchObject({rate:31,amount:31});
  });
  it('never guesses the in-person tutoring rate when the actual delivery format is absent',()=>{
    const rateProfile={...profile,category:2,tutoringLevel:4,tutoringVirtualRate:25,tutoringInPersonRate:27};
    expect(()=>line('TUTORING 15 MIN',{rateProfile})).toThrow('actual tutoring delivery format');
    expect(line('TUTORING 15 MIN',{rateProfile,actualMinutes:60,serviceContext:{format:'virtual'}}).amount).toBe(25);
    expect(line('TUTORING 15 MIN',{rateProfile,actualMinutes:60,serviceContext:{format:'in-person'}}).amount).toBe(27);
  });
  it('preserves the disclosed first-sixty-day program adjustment for new Categories 3–4 and exempts Category 2',()=>{
    const rateProfile={...profile,...programScheduleTerms({tenant:'nlu',category:2,level:3}),category:3};
    const probation={...status,inProbation:true,tenureDays:59,useReducedRates:true};
    expect(line('HOMEWORK HELP 15 MIN',{rateProfile,actualMinutes:60,status:probation})).toMatchObject({rate:17,amount:17,programProbationApplied:true,autoIndirectAmount:0});
    expect(line('HOMEWORK HELP 15 MIN',{rateProfile,actualMinutes:60,status:{...probation,tenureDays:60}})).toMatchObject({rate:20,amount:20,programProbationApplied:false});
    expect(line('HOMEWORK HELP 15 MIN',{rateProfile,actualMinutes:60,status:{...probation,inProbation:false,isMinimumWorkload:true}}).amount).toBe(20);
    expect(line('HOMEWORK HELP 15 MIN',{rateProfile:{...rateProfile,category:2},actualMinutes:60,status:probation})).toMatchObject({rate:20,programProbationApplied:false});
    const tutor={...rateProfile,tutoringLevel:3,tutoringHourlyRate:30,tutoringVirtualRate:30,tutoringRateProbation:25.5};
    expect(line('TUTORING VIRTUAL',{rateProfile:tutor,actualMinutes:60,status:probation})).toMatchObject({rate:25.5,programProbationApplied:true});
    expect(line('TUTORING VIRTUAL',{rateProfile:tutor,actualMinutes:60,status:{...probation,tenureDays:60}})).toMatchObject({rate:30,programProbationApplied:false});
  });
  it('blocks all clinical codes and testing for foundational providers',()=>{
    for(const code of ['H0004','H2014','90837','96136','96130','PSYCHOTHERAPY'])expect(()=>line(code,{rateProfile:{...profile,category:1}})).toThrow('limited to approved nonclinical');
    expect(line('TUTORING VIRTUAL',{rateProfile:{...profile,category:1,tutoringLevel:3,indirectRate:18,tutoringRate:null},actualMinutes:60})).toMatchObject({rate:19,amount:19,autoIndirectAmount:3});
  });
  it('retains service context through calculator and payroll-breakdown calculations',()=>{
    const rateProfile={...profile,category:2,childcareLevel:3};
    const result=estimatePay({rateProfile,status,lines:[{serviceCode:'CHILDCARE',quantity:1,actualMinutes:30,serviceContext:{...wageFloor,children:3,caregivers:1}}]});
    expect(result.lines[0]).toMatchObject({rate:30,lineTotal:15});
    const breakdown={'96130':{units:1,category:'direct',actualMinutes:90,serviceContext:wageFloor}};
    const payroll=applyPaySystemToBreakdown({breakdown,rateProfile:profile,status});
    expect(payroll.servicePay).toBe(66);
    expect(breakdown['96130'].amount).toBe(66);
  });
  it('splits ninety actual testing minutes across two dated work records without duplicating aggregate time',()=>{
    const assignment={category:3,level:3,pay_system_effective_start:'2026-11-21',compensation_policy_version:COMPENSATION_POLICY_VERSION,compensation_agreement_effective_on:'2026-11-21',waive_probation:1,waive_minimum_workload:1};
    const boundaryStatus={...status,agreementBoundary:'2026-11-21',agreementStatusArgs:{assignment,providerStartDate:'2026-01-01',periodEnd:'2026-12-04',benefitTierLevel:1},agreementLegacyAssignment:assignment};
    const breakdown={'96130':{units:2,category:'direct',actualMinutes:90}};
    const records=[{serviceDate:'2026-11-22',units:1,actualMinutes:30,serviceContext:wageFloor},{serviceDate:'2026-11-23',units:1,actualMinutes:60,serviceContext:wageFloor}];
    const result=applyPaySystemToBreakdown({breakdown,rateProfile:profile,status:boundaryStatus,datedUnitsByCode:new Map([['96130',records]])});
    expect(result.servicePay).toBe(66);
    const workRows=Object.values(breakdown).filter(row=>row?.actualMinutes!=null);
    expect(workRows.map(row=>row.actualMinutes)).toEqual([30,60]);expect(workRows.reduce((total,row)=>total+row.amount,0)).toBe(66);
    const makeBreakdown=()=>({'96130':{units:2,category:'direct',actualMinutes:90}});
    expect(()=>applyPaySystemToBreakdown({breakdown:makeBreakdown(),rateProfile:profile,status:boundaryStatus,datedUnitsByCode:new Map([['96130',records.map(({actualMinutes,...record})=>record)]])})).toThrow('each dated');
    expect(()=>applyPaySystemToBreakdown({breakdown:makeBreakdown(),rateProfile:profile,status:boundaryStatus,datedUnitsByCode:new Map([['96130',records.map(({serviceContext,...record})=>record)]])})).toThrow('each dated');
    expect(()=>applyPaySystemToBreakdown({breakdown:makeBreakdown(),rateProfile:profile,status:boundaryStatus,datedUnitsByCode:new Map([['96130',[records[0],{...records[1],actualMinutes:70}]]])})).toThrow('do not match the aggregate time');
  });
  it('keeps attendance and caregiver context attached to each actual childcare work segment',()=>{
    const rateProfile={...profile,category:2,childcareLevel:3};
    const assignment={category:2,level:3,pay_system_effective_start:'2026-11-21',compensation_policy_version:COMPENSATION_POLICY_VERSION,compensation_agreement_effective_on:'2026-11-21',waive_probation:1,waive_minimum_workload:1};
    const boundaryStatus={...status,agreementBoundary:'2026-11-21',agreementStatusArgs:{assignment,providerStartDate:'2026-01-01',periodEnd:'2026-12-04',benefitTierLevel:1},agreementLegacyAssignment:assignment};
    const breakdown={CHILDCARE:{units:2,category:'childcare',actualMinutes:90}};
    const records=[{serviceDate:'2026-11-22',units:1,actualMinutes:30,serviceContext:{...wageFloor,children:1,caregivers:1}},{serviceDate:'2026-11-22',units:1,actualMinutes:60,serviceContext:{...wageFloor,children:3,caregivers:1}}];
    const result=applyPaySystemToBreakdown({breakdown,rateProfile,status:boundaryStatus,datedUnitsByCode:new Map([['CHILDCARE',records]])});
    expect(result.servicePay).toBe(42);
    expect(Object.values(breakdown).filter(row=>row?.actualMinutes!=null).map(row=>[row.actualMinutes,row.rateAmount])).toEqual([[30,24],[60,30]]);
  });
  it('preserves signed legacy profile semantics and a prospective service boundary',()=>{
    const legacy=agreementRateProfile(profile,{id:1,effectiveOn:'2026-10-10',data:{schedule:{category:1,level:4,creditRate:30,hcodeRate:28,indirectRate:20,supportRate:18}}});
    expect(legacy.nluCompensationPolicyVersion).toBeNull();
    expect(computeLineAmount({rateProfile:legacy,status,serviceCode:'90837',quantity:1}).amount).toBe(30);
    expect(()=>line('96130',{rateProfile:{...profile,nluCompensationEffectiveOn:'2026-11-21'},status:{asOfDate:'2026-11-20'}})).toThrow('actual service date');
  });
  it('recognizes an executed NLU four-category employment contract without rewriting its signed tokens',()=>{
    const tokens={COMPENSATION_POLICY_VERSION:NLU_COMPENSATION_POLICY_VERSION,EFFECTIVE_DATE:'2026-11-21',COMPENSATION_SCHEDULE:JSON.stringify({...profile,category:4,level:3,supportRate:18})};
    const signed=executedAgreement({id:12,token_values_json:tokens,signed_pdf_path:'signed/12.pdf',audit_trail:{adminCountersign:{signedAt:'2026-11-23T12:00:00Z'}},metadata:{employmentContract:true}});
    expect(signed).toMatchObject({effectiveOn:'2026-11-23',data:{employmentPayVersion:NLU_COMPENSATION_POLICY_VERSION,compensationPolicyVersion:COMPENSATION_POLICY_VERSION,schedule:{category:4,nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION}}});
    expect(tokens.COMPENSATION_POLICY_VERSION).toBe(NLU_COMPENSATION_POLICY_VERSION);
    expect(agreementRateProfile(profile,signed)).toMatchObject({category:4,nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,nluCompensationEffectiveOn:'2026-11-23'});
  });
});
