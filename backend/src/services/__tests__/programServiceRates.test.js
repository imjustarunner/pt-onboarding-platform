import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import { programScheduleTerms, programServiceRate } from '../../content/programServiceRates.js';
import { computeLineAmount, resolveUserPaySystemStatus, applyPaySystemToBreakdown } from '../paySystem.service.js';
import { agreementRateProfile, executedAgreement, COMPENSATION_POLICY_VERSION } from '../employmentAgreementPolicy.service.js';
import { employmentCategoryLevelTerms } from '../../content/employmentCategoryLevelTerms.js';
import { getHandbookSource } from '../workplaceHandbookContent.js';
const base = {category:2,level:1,creditRate:44,creditRateProbation:38,hcodeRate:32,hcodeRateProbation:25,indirectRate:22,supportActivityRate:18,autoIndirectMinutesPerHour:10,compensationPolicyVersion:COMPENSATION_POLICY_VERSION};
const profile = (category=2,level=1,tenant='nlu')=>({...base,category,level,...programScheduleTerms({tenant,category,level,effectiveOn:'2026-10-29'})});
const status = (date='2026-10-29',extra={})=>({asOfDate:date,inProbation:true,tenureDays:28,useReducedRates:true,...extra});
const line = (code,p=profile(),s=status(),quantity=4)=>computeLineAmount({rateProfile:p,status:s,serviceCode:code,quantity});

describe('separate academic and H2014 program schedules',()=>{
  it('selects each requested category/level, without changing ITSCO',()=>{
    expect([1,2,3,4,5].map(level=>programServiceRate({service:'homework_help',category:1,level,tenant:'nlu'}))).toEqual([16,16,16,18,18]);
    expect([1,2,3,4,5].map(level=>programServiceRate({service:'tutoring',category:3,level,tenant:'nlu'}))).toEqual([28,28,28,30,30]);
    expect([1,2,3,4,5].map(level=>programServiceRate({service:'h2014',category:1,level,tenant:'nlu'}))).toEqual([18,18,18,20,20]);
    expect(programScheduleTerms({tenant:'itsco',category:2,level:1})).toEqual({});
    expect(programServiceRate({service:'tutoring',category:2,level:1,tenant:'isi',inProgramProbation:true})).toBe(20.4);
  });
  it('uses each actual program service instead of clinical or general H-code rates',()=>{
    expect(line('TUTORING 15 MIN')).toMatchObject({rate:20.4,amount:20.4,programService:'tutoring',programProbationApplied:true,autoIndirectHours:1/6});
    expect(line('HOMEWORK HELP 15 MIN')).toMatchObject({rate:17,amount:17,programService:'homework_help',autoIndirectHours:0});
    expect(line('H2014')).toMatchObject({rate:17,amount:17,programService:'h2014',autoIndirectHours:1/6});
    expect(line('90837',profile(),status(),1)).toMatchObject({rate:38,amount:38,programService:null});
    expect(line('H0004')).toMatchObject({rate:25,amount:25,programService:null});
  });
  it('ends reduction after day60, exempts Category1 and ignores minimum workload',()=>{
    expect(line('TUTORING 15 MIN',profile(1))).toMatchObject({rate:20,programProbationApplied:false});
    expect(line('TUTORING 15 MIN',profile(),status('2026-11-29',{tenureDays:59})).rate).toBe(20.4);
    expect(line('TUTORING 15 MIN',profile(),status('2026-11-30',{tenureDays:60})).rate).toBe(24);
    expect(line('TUTORING 15 MIN',profile(),status(undefined,{inProbation:false,isMinimumWorkload:true})).rate).toBe(24);
    expect(line('TUTORING 15 MIN',profile(),status(undefined,{waiveProbation:true})).rate).toBe(24);
  });
  it('preserves historical signed terms and refuses an undated new rate',()=>{
    expect(line('TUTORING 15 MIN',{...base,tutoringRate:20.5})).toMatchObject({rate:20.5,programService:null});
    expect(()=>line('TUTORING 15 MIN',profile(),status('2026-10-28'))).toThrow('historical program rate');
    expect(()=>line('HOMEWORK HELP 15 MIN',base)).toThrow('approved, effective');
    const result=agreementRateProfile(profile(),{id:7,effectiveOn:'2026-10-29',data:{compensationPolicyVersion:COMPENSATION_POLICY_VERSION,schedule:{...base,tutoringRate:20.5,supportRate:18}}});
    expect(result.programRatesVersion).toBeNull(); expect(result.tutoringRate).toBe(20.5);
  });
  it('splits at day61 while clinical probation is still active',()=>{
    const assignment={category:2,level:1,pay_system_effective_start:'2026-10-29',compensation_policy_version:COMPENSATION_POLICY_VERSION,compensation_agreement_effective_on:'2026-10-29'};
    const args={assignment,providerStartDate:'2026-10-01',periodEnd:'2026-12-04',benefitTierLevel:1};
    const s={...resolveUserPaySystemStatus(args),agreementBoundary:'2026-10-29',agreementStatusArgs:args,agreementLegacyAssignment:assignment};
    const breakdown={'TUTORING 15 MIN':{units:8,category:'tutoring',payDivisor:4,creditValue:.25}};
    const result=applyPaySystemToBreakdown({breakdown,rateProfile:profile(),status:s,datedUnitsByCode:new Map([['TUTORING 15 MIN',[{serviceDate:'2026-11-29',units:4},{serviceDate:'2026-11-30',units:4}]]])});
    expect(result.servicePay).toBe(44.4);
    expect(Object.values(breakdown).filter(r=>r?.rateSource==='pay_system').map(r=>r.rateAmount)).toEqual([20.4,24]);
  });
  it('generates explicit new agreement schedules and separate table rows',()=>{
    const terms=employmentCategoryLevelTerms({row:{category:2,level:1,paySystem:base},agencySlug:'nlu',tokens:{ROLE_LABEL:'Tutor'}});
    expect(terms.schedule).toMatchObject({homeworkHelpRate:20,tutoringRate:24,h2014Rate:20,tutoringRateProbation:20.4});
    expect(terms.compensation).toContain('Separate program pay types'); expect(terms.compensation).toContain('$20.40');
    expect(terms.compensation).not.toContain('<th scope="row">Clinical Session Rate');
    const signed=executedAgreement({id:9,signed_pdf_path:'signed/9.pdf',audit_trail:{adminCountersign:{signedAt:'2026-11-02T12:00:00Z'}},metadata:{employmentContract:true},token_values_json:{EFFECTIVE_DATE:'2026-11-01',COMPENSATION_POLICY_VERSION:terms.version,COMPENSATION_SCHEDULE:terms.schedule}});
    expect(signed).toMatchObject({effectiveOn:'2026-11-02',data:{compensationPolicyVersion:COMPENSATION_POLICY_VERSION,schedule:{tutoringRate:24,tutoringRateProbation:20.4}}});
    expect(agreementRateProfile(base,signed)).toMatchObject({programRatesEffectiveOn:'2026-11-02',tutoringRate:24});
  });
  it('shows program rows in fifteen tables without a separate ISI pay-approval condition',()=>{
    for(const slug of ['nlu','tisi']) {
      const source=getHandbookSource({slug});
      const rateSections=source.sections.filter(s=>/^compensation-rate-category-[123]$/.test(s.slug));
      expect(rateSections).toHaveLength(3);
      for(const section of rateSections) expect(section.body_html.match(/Homework Help<br \/><small>per direct-hour equivalent/g)).toHaveLength(5);
      expect(source.reviewUpdates.some(u=>u.subject==='Homework Help, Tutoring and Therapy + Tutoring rates')).toBe(true);
      if(slug==='tisi')expect(source.sections.find(s=>s.slug==='program-service-rate-schedules').body_html).toContain('Your selected compensation category and level determine the rates');
    }
  });
});


it.each([
  ['nlu',2,1,'Employee','Tutoring Specialist',20,24,20,20.4],
  ['tisi',3,5,'Provider','Therapist',22,30,22,25.5],
  ['nlu',1,4,'Employee','Homework Help Assistant',18,22,20,22]
])('new %s category %s level %s contract displays its selected program rates', (slug,category,level,role,title,homework,tutoring,h2014,probation) => {
  const terms=employmentCategoryLevelTerms({row:{category,level,paySystem:base},agencySlug:slug,tokens:{ROLE_LABEL:role,JOB_TITLE:title}});
  expect(terms.schedule).toMatchObject({category,level,homeworkHelpRate:homework,tutoringRate:tutoring,h2014Rate:h2014,tutoringRateProbation:probation});
  for(const label of ['Homework Help','Tutoring','Therapy + Tutoring'])expect(terms.compensation).toContain(label);
  expect(terms.compensation).toContain('$'+probation.toFixed(2));
  if(role==='Employee')expect(terms.compensation).not.toContain('<th scope="row">Clinical Session Rate');
});


it.each([1,2,3])('preserves automatic indirect with Category %s program rates and greater agreed allowances', category => {
  const standard = {...profile(category), autoIndirectMinutesPerHour:0};
  for (const code of ['H2014','TUTORING 15 MIN','H0004']) {
    expect(line(code,standard)).toMatchObject({autoIndirectHours:1/6});
    expect(line(code,{...standard,autoIndirectMinutesPerHour:20})).toMatchObject({autoIndirectHours:1/3});
  }
  expect(line('HOMEWORK HELP 15 MIN',standard)).toMatchObject({autoIndirectHours:0,autoIndirectAmount:0});
  const terms=employmentCategoryLevelTerms({row:{category,level:1,paySystem:standard},agencySlug:'nlu',tokens:{ROLE_LABEL:'Tutor'}});
  expect(terms.schedule.autoIndirectMinutes).toBe(10);
  expect(terms.compensation).not.toContain('no indirect allowance is added automatically');
});
