import {beforeEach,describe,expect,it,vi} from 'vitest';
import {assertContractProbationChoice,withContractProbation,contractProbationHtml} from '../../content/contractProbationPolicy.js';
import {probationChoice} from '../../content/contractProbationPolicy.js';
import {personalRateTable,personalPayTypeDescriptions} from '../../content/compensationSchedulePresentation.js';
import {resolveUserPaySystemStatus,resolveMidPeriodRateSplit,applyPaySystemToBreakdown} from '../paySystem.service.js';
const mocks=vi.hoisted(()=>({autofill:vi.fn(),render:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../contractMerge.service.js',()=>({autofillTokensForCandidate:mocks.autofill,renderContractHtml:mocks.render,getAgencyBuilderDefaults:vi.fn(),inferCompensationFromCredential:vi.fn()}));
vi.mock('../../models/PayrollCompensationLevel.model.js',()=>({default:{},COMPENSATION_CATEGORIES:[]}));
import {previewCandidateContract,generateAndAssignCandidateContract} from '../contractGenerator.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.autofill.mockResolvedValue({AGENCY_SLUG:'itsco',START_DATE:'2026-11-13'});mocks.render.mockResolvedValue({config:{slug:'itsco_employment_hourly',pay_mode:'hourly',is_active:1},html:'<p>New agreement</p>',tokens:{},unresolvedTokens:[]})});
describe('conscious prospective probation selection',()=>{
 it.each(['itsco','nlu','tisi'])('rejects a missing choice in %s API previews and issuance',async slug=>{
  mocks.autofill.mockResolvedValue({AGENCY_SLUG:slug});
  const input={agencyId:6,candidateUserId:11,configId:1,tokens:{AGENCY_SLUG:'unrelated'}};
  await expect(previewCandidateContract(input)).rejects.toThrow('Select Yes or No');
  await expect(generateAndAssignCandidateContract(input)).rejects.toThrow('Select Yes or No');
  expect(mocks.execute).not.toHaveBeenCalled();
 });
 it.each(['yes','no'])('accepts the explicit %s choice and retains server-derived reference behavior',async choice=>{
  await expect(previewCandidateContract({agencyId:2,candidateUserId:11,configId:1,tokens:{PROBATION_APPLIES:choice,HANDBOOK_REFERENCES_ENABLED:'0'}})).resolves.toMatchObject({html:'<p>New agreement</p>'});
  expect(mocks.render.mock.calls[0][0].tokens.HANDBOOK_REFERENCES_ENABLED).toBe('1');
 });
 it('requires individually approved duration/rates for ISI probation instead of inferring another company’s rates',()=>{
  const input={agencySlug:'tisi',config:{slug:'employment',pay_mode:'hourly'}};
  expect(()=>assertContractProbationChoice({...input,tokens:{PROBATION_APPLIES:'yes',START_DATE:'2026-11-13'}})).toThrow('individual probation duration');
  expect(()=>assertContractProbationChoice({...input,tokens:{PROBATION_APPLIES:'yes',START_DATE:'2026-11-13',PROBATION_TERMS:'Original 30 days; agreed clinical $50 and direct care $30/hour; reference Offer A.'}})).not.toThrow();
 });
 it('leaves amendments and historical profiles intact, including reduced rates previously agreed',()=>{
  expect(()=>assertContractProbationChoice({agencySlug:'itsco',config:{slug:'compensation_addendum',pay_mode:'ffs'},tokens:{}})).not.toThrow();
  const profile={creditRate:50,creditRateProbation:40,hcodeRate:32,hcodeRateProbation:25};
  expect(withContractProbation(profile,{})).toEqual(profile);expect(probationChoice({})).toBe(null);
  const no=withContractProbation(profile,{PROBATION_APPLIES:'no'});
  expect(no).toMatchObject({creditRate:50,creditRateProbation:50,hcodeRateProbation:32,probationWaived:true,minimumWorkloadEnabled:false});
  expect(profile.creditRateProbation).toBe(40);
  expect(contractProbationHtml(no)).toContain('expressly selected no');
 });
 it('discloses the selected rates and disables minimum-workload reductions for a new Yes agreement',()=>{
  const yes=withContractProbation({category:2,creditRate:50,creditRateProbation:40,hcodeRate:32,hcodeRateProbation:25,indirectRate:20,supportRate:18},{PROBATION_APPLIES:'yes'});
  expect(yes).toMatchObject({probationApplies:true,probationWaived:false,minimumWorkloadEnabled:false});
  expect(personalRateTable(yes)).toContain('Selected probationary rate');expect(personalPayTypeDescriptions(yes)).toContain('Minimum-workload reductions are not activated');
 });
 it('rejects truthy defaults and malformed values instead of guessing a Yes/No choice',()=>{expect(()=>probationChoice({PROBATION_APPLIES:'true'})).toThrow('Yes or No');expect(()=>probationChoice({PROBATION_APPLIES:1})).toThrow('Yes or No')});
 it('preserves a fully specified original start date and rejects dates that would guess the year',()=>{
  expect(withContractProbation({creditRate:50},{PROBATION_APPLIES:'yes',START_DATE:'November 13, 2026'}).originalProbationStartDate).toBe('2026-11-13');
  expect(()=>assertContractProbationChoice({agencySlug:'itsco',config:{pay_mode:'hourly'},tokens:{PROBATION_APPLIES:'yes',START_DATE:'November 13'}})).toThrow('original employment start date');
 });
 it('waives minimum-workload reductions from the approved service date and preserves earlier dates',()=>{
  const input={assignment:{waive_probation:1,minimum_workload_waived_from:'2026-11-13'},providerStartDate:'2024-01-01',periodStart:'2026-11-07',periodEnd:'2026-11-20',benefitTierLevel:0};
  expect(resolveUserPaySystemStatus({...input,asOfDate:'2026-11-12'})).toMatchObject({isMinimumWorkload:true,useReducedRates:true});
  expect(resolveUserPaySystemStatus({...input,asOfDate:'2026-11-13'})).toMatchObject({isMinimumWorkload:false,useReducedRates:false});
  const split=resolveMidPeriodRateSplit(input);expect(split.cutoff).toBe('2026-11-13');expect(split.preStatus.isMinimumWorkload).toBe(true);expect(split.postStatus.isMinimumWorkload).toBe(false);
 });
 it('pays the pre-policy service at its prior rate and the effective-date service at the regular rate in one pay period',()=>{
  const assignment={category:2,level:1,waive_probation:1,minimum_workload_waived_from:'2026-11-13',compensation_policy_version:'itsco-2026-10-service-credit-v3',compensation_agreement_effective_on:'2026-08-01'};
  const args={assignment,providerStartDate:'2024-01-01',periodEnd:'2026-11-20',benefitTierLevel:0};
  const status={...resolveUserPaySystemStatus(args),agreementBoundary:'2026-08-01',agreementStatusArgs:args,agreementLegacyAssignment:assignment,agreementPriorRateProfile:null};
  const rateProfile={category:2,level:1,creditRate:44,creditRateProbation:38,hcodeRate:32,hcodeRateProbation:25,indirectRate:22,supportActivityRate:18,compensationPolicyVersion:'itsco-2026-10-service-credit-v3'};
  const breakdown={'90837':{units:2,finalizedUnits:2,category:'direct'}};
  const result=applyPaySystemToBreakdown({breakdown,rateProfile,status,datedUnitsByCode:new Map([['90837',[{serviceDate:'2026-11-12',units:1},{serviceDate:'2026-11-13',units:1}]]])});
  expect(result.servicePay).toBe(82);
  expect(Object.values(breakdown).filter(r=>r&&typeof r==='object'&&r.displayServiceCode==='90837').map(r=>r.rateAmount).sort()).toEqual([38,44]);
 });
});
