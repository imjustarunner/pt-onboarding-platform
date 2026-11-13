import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {TESTING_SERVICE_POLICY_VERSION,TESTING_SERVICE_CODES,testingServiceDefinition,testingMargin,computeTestingServicePay,testingCodeReferenceHtml,testingCompensationSchedule} from '../../content/testingServicePolicy.js';
import {classifyPayType} from '../payrollCodeClassification.js';
import {payrollDefaultsForCode} from '../payrollServiceCodeDefaults.js';
import {compensationCodes} from '../payrollSubmissionContext.service.js';
import {computeLineAmount,applyPaySystemToBreakdown} from '../paySystem.service.js';
import {COMPENSATION_POLICY_VERSION} from '../employmentAgreementPolicy.service.js';
import {requireTestingEligibility} from '../testingEligibility.service.js';
import {isClinicalAddon} from '../../utils/clinicalServiceCodeCatalog.js';
import {employmentCategoryLevelTerms} from '../../content/employmentCategoryLevelTerms.js';
import {contractServiceRolePlan} from '../../content/contractServiceRoles.js';
import {contractServiceRates} from '../contractCompensation.service.js';
import {NLU_COMPENSATION_POLICY_VERSION} from '../../content/nluCompensationPolicy.js';
const profile={testingServicePolicyVersion:TESTING_SERVICE_POLICY_VERSION,serviceRoles:['psychological_testing'],testingAuthorized:true,creditRate:44,creditRateProbation:38,hcodeRate:32,hcodeRateProbation:25,indirectRate:22};
const pay=(code,minutes,extra={})=>computeTestingServicePay({profile,serviceCode:code,actualMinutes:minutes,...extra});
describe('component compensation rather than a blanket 9-code credit',()=>{
  it.each(['96116','96121','96130','96131','96132','96133'])('maps %s to eligible evaluation credits, including report work',code=>{
    expect(classifyPayType(code,payrollDefaultsForCode(code))).toBe('credit');
    expect(pay(code,90)).toMatchObject({hours:1.5,amount:66,autoIndirectAmount:0});
  });
  it.each(['96136','96137','96138','96139'])('maps %s administration to Direct Care and prorated indirect',code=>{
    expect(classifyPayType(code,payrollDefaultsForCode(code))).toBe('hcode');
    expect(payrollDefaultsForCode(code).creditValue).toBe(.5);
    expect(pay(code,30)).toMatchObject({hours:.5,amount:16,autoIndirectHours:1/12});
    expect(pay(code,30).autoIndirectAmount).toBeCloseTo(22/12);
  });
  it('pays a brief clinical call for actual minutes instead of a full clinical credit',()=>{
    const actual=computeLineAmount({rateProfile:profile,status:{},serviceCode:'98966',quantity:1,actualMinutes:10});
    expect(actual).toMatchObject({payType:'hcode',payHours:1/6,amount:5.33,autoIndirectAmount:.61,totalWithAutoIndirect:5.94});
    expect(pay('98966',10,{profile:{...profile,serviceRoles:['psychotherapy'],testingAuthorized:false}}).amount).toBeCloseTo(32/6);
  });
  it('never infers actual work from a claim unit and preserves historical schedules',()=>{
    expect(()=>pay('96136',null)).toThrow('actual work minutes');
    expect(pay('96136',30,{profile:{...profile,testingServicePolicyVersion:null}})).toBeNull();
    expect(pay('H0004',15)).toBeNull();
  });
  it('preserves component minutes across dated payroll records outside NLU',()=>{
    const assignment={category:2,level:3,pay_system_effective_start:'2026-11-01',compensation_policy_version:COMPENSATION_POLICY_VERSION,compensation_agreement_effective_on:'2026-11-01',waive_probation:1,waive_minimum_workload:1};
    const status={agreementBoundary:'2026-11-01',agreementStatusArgs:{assignment,providerStartDate:'2026-01-01',periodEnd:'2026-11-20',benefitTierLevel:1},agreementLegacyAssignment:assignment};
    const records=[{serviceDate:'2026-11-13',units:1,actualMinutes:10},{serviceDate:'2026-11-14',units:1,actualMinutes:20}];
    const breakdown={'96136':{units:2,category:'direct',actualMinutes:30}};
    const result=applyPaySystemToBreakdown({breakdown,rateProfile:profile,status,datedUnitsByCode:new Map([['96136',records]])});
    expect(result.servicePay).toBe(16);
    const work=Object.values(breakdown).filter(row=>row?.actualMinutes!=null);
    expect(work.map(row=>row.actualMinutes)).toEqual([10,20]);
    expect(work.reduce((total,row)=>total+row.amount,0)).toBe(16);
    expect(()=>applyPaySystemToBreakdown({breakdown:{'96136':{units:2,category:'direct',actualMinutes:30}},rateProfile:profile,status,datedUnitsByCode:new Map([['96136',records.map(({actualMinutes,...r})=>r)]])})).toThrow('each dated');
  });
  it('preserves larger agreed allowances and NLU wage-floor review',()=>{
    expect(pay('96136',60,{profile:{...profile,autoIndirectMinutesPerHour:15}}).autoIndirectHours).toBe(.25);
    expect(()=>pay('96136',30,{profile:{...profile,nluCompensationPolicyVersion:'recorded-nlu-policy'}})).toThrow('work-location wage floor');
    expect(pay('96136',30,{profile:{...profile,nluCompensationPolicyVersion:'recorded-nlu-policy'},serviceContext:{minimumHourlyRate:40,wageFloorJurisdiction:'Verified location'}}).amount).toBe(20);
    expect(()=>pay('96136',30,{profile:{...profile,nluCompensationPolicyVersion:'recorded-nlu-policy',category:1}})).toThrow('limited to approved nonclinical');
    expect(pay('96130',60,{status:{useReducedRates:true},profile:{...profile,testingEvaluationRate:44}}).amount).toBe(44);
  });
  it('keeps base/add-on identities and telephone encounter durations explicit',()=>{
    expect(testingServiceDefinition('96131').baseCode).toBe('96130');
    expect(testingServiceDefinition('96121').baseCode).toBe('96116');
    expect(testingServiceDefinition('96116').providerCategories).toContain('licensed psychologist');
    expect(testingServiceDefinition('96133').baseCode).toBe('96132');
    expect(testingServiceDefinition('96137').baseCode).toBe('96136');
    expect(testingServiceDefinition('96139').baseCode).toBe('96138');
    for(const code of ['96131','96133','96137','96139'])expect(isClinicalAddon(code)).toBe(true);
    expect(testingServiceDefinition('98968')).toMatchObject({minimumMinutes:21,maximumMinutes:30,claimBasis:'encounter',requiredRole:null});
    expect(testingServiceDefinition('H0001')).toMatchObject({claimBasis:'encounter',requiredRole:null});
  });
  it('marks unapproved Testing entries as restricted in the compensation guide',()=>{
    const rules=TESTING_SERVICE_CODES.map(d=>({service_code:d.code,...Object.fromEntries(Object.entries(payrollDefaultsForCode(d.code)).map(([key,value])=>[key==='paySystemBucket'?'pay_system_bucket':key,value]))}));
    expect(compensationCodes(rules).find(r=>r.code==='96130')).toMatchObject({restricted:true,requiredServiceRole:'psychological_testing',medicaidOnly:true});
    expect(compensationCodes(rules,profile).find(r=>r.code==='96136')).toMatchObject({restricted:false,payType:'hcode',basis:'minutes',creditValue:1/60});
    expect(compensationCodes(rules).find(r=>r.code==='H0004').restricted).toBe(false);
  });
  it('shows labor contribution rather than promising profit or using revenue as wages',()=>{
    const result=testingMargin({code:'96139',actualMinutes:30,profile,reimbursement:14.66});
    expect(result.wages).toBe(16);expect(result.remainingBeforeOtherOverhead).toBeCloseTo(-3.17333333);
    expect(result.nonpositive).toBe(true);
    const call=testingMargin({code:'98966',actualMinutes:10,profile,reimbursement:44,materialsCost:2,supervisionCost:3});
    expect(call.wages).toBeCloseTo(32/6);expect(call.remainingBeforeOtherOverhead).toBeCloseTo(33.05555555);
  });
  it('includes the code/time reference in handbook content and uses configured contract rates',()=>{
    const html=testingCodeReferenceHtml();for(const code of ['96130','96137','H0001','98968'])expect(html).toContain(code);
    expect(html).toContain('Routine reminder, scheduling or billing calls are indirect');
    const terms=testingCompensationSchedule(profile);expect(terms).toContain('$44.00/actual hour-equivalent');expect(terms).toContain('$32.00/actual hour');expect(terms).toContain('Medicaid-only');
  });
  it.each(['itsco','nlu','tisi'])('resolves approved Testing contract terms and role scope for %s',agencySlug=>{
    const paySystem={...profile,supportActivityRate:18,...(agencySlug==='nlu'?{nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION}:{})};
    const tokens={ROLE_LABEL:'Provider',CREDENTIAL:'MA',CONTRACT_SERVICE_ROLES:['psychological_testing'],CONTRACT_SERVICE_ROLE_DETAILS:{psychological_testing:{authorizationTerms:'Instrument/component-specific approval reference A; responsible qualified licensee and supervision recorded.'}}};
    const terms=employmentCategoryLevelTerms({agencySlug,row:{category:agencySlug==='nlu'?3:2,level:3,paySystem},tokens});
    expect(terms.schedule).toMatchObject({serviceRoles:['psychological_testing'],testingAuthorized:true,testingServicePolicyVersion:TESTING_SERVICE_POLICY_VERSION,testingEvaluationRate:44,testingAdministrationRate:32});
    expect(terms.serviceCompensationTerms.psychological_testing).toContain('Medicaid-only');
    expect(contractServiceRolePlan({selected:tokens.CONTRACT_SERVICE_ROLES,details:tokens.CONTRACT_SERVICE_ROLE_DETAILS,serviceCompensationTerms:terms.serviceCompensationTerms}).missingFields).toEqual([]);
  });
  it('shows an hourly contract rate rather than valuing a half-hour claim as one full credit',()=>{
    const rows=contractServiceRates({paySystem:profile},[{service_code:'96136',category:'direct',pay_system_bucket:'hcode',show_in_rate_sheet:1}]);
    expect(rows[0]).toMatchObject({code:'96136',rate:'$32.00',requiredServiceRole:'psychological_testing'});
    expect(rows[0].unit).toContain('actual eligible hour');expect(rows[0].compensationBasis).toContain('0.5 hour');
  });
});
describe('Testing service role and Medicaid enforcement',()=>{
  const agreement={id:77,effectiveOn:'2026-11-01',data:{schedule:profile}};
  const deps={agreements:vi.fn(async()=>[agreement]),insurance:vi.fn(async()=>({primary:{isMedicaid:true}})),assignedCodes:vi.fn(async()=>['96136'])};
  const input={agencyId:2,userId:71,clientId:9,serviceDate:'2026-11-13',serviceCodes:['96136']};
  it.each([2,6,7,453,454])('requires the same explicit grant in practice %s',async agencyId=>{
    expect(await requireTestingEligibility({...input,agencyId},{},deps)).toMatchObject({agreementId:77,medicaidOnly:true});
    expect(deps.agreements).toHaveBeenLastCalledWith({agencyId,userId:71},{});
  });
  it('does not impose Testing-only permission on counseling or clinical telephone work',async()=>{
    const agreements=vi.fn();expect(await requireTestingEligibility({...input,serviceCodes:['H0004','H0001','98966']},{},{agreements})).toBeNull();expect(agreements).not.toHaveBeenCalled();
  });
  it('rejects a draft, future approval, a non-Testing role and commercial-only coverage',async()=>{
    await expect(requireTestingEligibility(input,{}, {...deps,agreements:async()=>[]})).rejects.toHaveProperty('code','TESTING_ROLE_REQUIRED');
    await expect(requireTestingEligibility(input,{}, {...deps,agreements:async()=>[{...agreement,effectiveOn:'2027-01-01'}]})).rejects.toHaveProperty('code','TESTING_ROLE_REQUIRED');
    await expect(requireTestingEligibility(input,{}, {...deps,agreements:async()=>[{...agreement,data:{schedule:{...profile,serviceRoles:['tutoring']}}}]})).rejects.toHaveProperty('code','TESTING_ROLE_REQUIRED');
    await expect(requireTestingEligibility(input,{}, {...deps,insurance:async()=>({primary:{insurerName:'Commercial Plan'}})})).rejects.toHaveProperty('code','TESTING_MEDICAID_REQUIRED');
    await expect(requireTestingEligibility(input,{}, {...deps,agreements:async()=>[{...agreement,data:{schedule:{testingAuthorized:true,serviceRoles:'unparseable'}}}]})).rejects.toHaveProperty('code','TESTING_ROLE_REQUIRED');
  });
  it('does not resurrect an earlier grant after a later applicable agreement removes Testing',async()=>{
    const revoked={id:78,effectiveOn:'2026-11-12',data:{schedule:{...profile,serviceRoles:['psychotherapy'],testingAuthorized:false}}};
    await expect(requireTestingEligibility(input,{}, {...deps,agreements:async()=>[agreement,revoked]})).rejects.toHaveProperty('code','TESTING_ROLE_REQUIRED');
  });
  it('preserves a signed role through an unrelated compensation-only amendment',async()=>{
    const compensationOnly={id:78,effectiveOn:'2026-11-12',data:{schedule:{creditRate:48,hcodeRate:32,indirectRate:24}}};
    expect(await requireTestingEligibility(input,{}, {...deps,agreements:async()=>[agreement,compensationOnly]})).toMatchObject({agreementId:77});
  });
  it('keeps administration, evaluation and neuropsychology assignments independent',async()=>{
    await expect(requireTestingEligibility({...input,serviceCodes:['96130']},{},deps)).rejects.toHaveProperty('code','TESTING_COMPONENT_REQUIRED');
    expect(await requireTestingEligibility({...input,serviceCodes:['96137']},{},deps)).toMatchObject({agreementId:77});
    await expect(requireTestingEligibility(input,{}, {...deps,assignedCodes:async()=>[]})).rejects.toHaveProperty('code','TESTING_COMPONENT_REQUIRED');
    expect(await requireTestingEligibility({...input,checkCodeAssignments:false},{}, {...deps,assignedCodes:async()=>[]})).toMatchObject({agreementId:77});
  });
});
