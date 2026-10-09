import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {decorateEstimateLine,computeLineAmount,resolveUserPaySystemStatus,applyPaySystemToBreakdown,computeBonuses} from '../paySystem.service.js';
import {executedAgreement,probationEndDate,COMPENSATION_POLICY_VERSION,agreementRateProfile} from '../employmentAgreementPolicy.service.js';
import {computeServiceCreditLeave,protectedSickRolloverLimit} from '../../utils/payrollPtoAccrual.util.js';
const profile={category:2,level:2,creditRate:44,creditRateProbation:36,hcodeRate:32,hcodeRateProbation:28,indirectRate:22,indirectRateProbation:20,supportActivityRate:24,supportActivityRateProbation:21,autoIndirectMinutesPerHour:10,leaveAdminRatio:.2,compensationPolicyVersion:COMPENSATION_POLICY_VERSION,agreementRateProfile};
const line=(serviceCode,quantity=1,status={})=>computeLineAmount({rateProfile:profile,status,serviceCode,quantity});
describe('signed service-credit compensation',()=>{
 it('pays a psychotherapy credit once, with no indirect cash supplement',()=>{expect(line('90837')).toMatchObject({amount:44,autoIndirectHours:0,autoIndirectAmount:0,totalWithAutoIndirect:44});});
 it('pays H0004 four units at direct plus exactly ten minutes indirect',()=>{expect(line('H0004',4)).toMatchObject({hourEquivalent:1,amount:32,autoIndirectHours:1/6,autoIndirectAmount:3.67,totalWithAutoIndirect:35.67});});
 it('uses each disclosed probation rate including indirect',()=>{expect(line('H0004',4,{useReducedRates:true})).toMatchObject({amount:28,autoIndirectHours:1/6,autoIndirectAmount:3.33});expect(line('MEETING',1,{useReducedRates:true}).rate).toBe(21);});
 it('respects explicit zero instead of restoring a default allowance',()=>{expect(computeLineAmount({rateProfile:{...profile,autoIndirectMinutesPerHour:0},serviceCode:'H0004',quantity:4,status:{}}).autoIndirectHours).toBe(0);});
 it.each([['90837',25,25,0]])('25 credits of %s earn exactly 1 sick hour without double multiplication',(code,units,direct,indirect)=>{
  const breakdown={[code]:{units,finalizedUnits:units,category:'direct'}};
  const meta=applyPaySystemToBreakdown({breakdown,rateProfile:profile,status:{}});
  const earned=computeServiceCreditLeave({summaryRow:{direct_hours:direct,indirect_hours:indirect,breakdown},policy:{},employmentType:'fee_for_service'});
  expect(meta.leaveBasis.direct).toBe(25);expect(meta.leaveBasis.indirect).toBe(5);expect(earned.sickEarn).toBe(1);
 });
 it('fractional clinical credit accrues proportionally',()=>{const breakdown={'90834':{units:1,creditValue:.75,category:'direct'}};applyPaySystemToBreakdown({breakdown,rateProfile:profile,status:{}});expect(computeServiceCreditLeave({summaryRow:{direct_hours:.75,breakdown},policy:{},employmentType:'fee_for_service'}).sickEarn).toBe(.03);});
 it('adds separately paid support hours and actual-hour reconciliation',()=>{const breakdown={'90837':{units:25,category:'direct'},actualWorkedHours:60};applyPaySystemToBreakdown({breakdown,rateProfile:profile,status:{}});const earned=computeServiceCreditLeave({summaryRow:{direct_hours:25,indirect_hours:0,breakdown},policy:{},employmentType:'fee_for_service'});expect(earned.sickEarn).toBe(2);expect(earned.reconciliationAddedHours).toBe(1);});
});
describe('agreement and probation dates',()=>{
 const assignment={compensation_policy_version:COMPENSATION_POLICY_VERSION,compensation_agreement_effective_on:'2026-10-10',pay_system_effective_start:'2026-10-10'};
 const status=(date,extra={})=>resolveUserPaySystemStatus({assignment,providerStartDate:'2024-01-01',periodEnd:date,benefitTierLevel:0,...extra});
 it('protects minimum workload for exactly 60 days',()=>{expect(status('2026-12-08').isMinimumWorkload).toBe(false);expect(status('2026-12-09').isMinimumWorkload).toBe(true);expect(status('2026-12-09').initiationProtectionEnd).toBe('2026-12-09');});
 it('keeps new-hire probation separate from the minimum-workload waiver',()=>{expect(status('2026-10-15',{providerStartDate:'2026-10-01'})).toMatchObject({inProbation:true,isMinimumWorkload:false,useReducedRates:true});});
 it('ends probation on day 90, waiver or Tier 3',()=>{expect(probationEndDate('2026-10-01')).toBe('2026-12-30');expect(status('2026-12-30',{providerStartDate:'2026-10-01',benefitTierLevel:1}).inProbation).toBe(false);expect(status('2026-10-15',{providerStartDate:'2026-10-01',benefitTierLevel:3}).inProbation).toBe(false);expect(status('2026-10-15',{providerStartDate:'2026-10-01',assignment:{...assignment,waive_probation:1}}).inProbation).toBe(false);});
 it('a prior recorded Tier 3 end prevents probation restarting',()=>{expect(status('2026-11-15',{providerStartDate:'2026-10-01',assignment:{...assignment,probation_ended_on:'2026-10-15'},benefitTierLevel:1}).inProbation).toBe(false);});
 it('unsigned or uncountersigned drafts cannot change the agreement date or payroll',()=>{expect(executedAgreement({token_values_json:{effectiveDate:'2026-10-10'}})).toBeNull();});
 it('late signatures preserve original agreement date but delay new pay conditions',()=>{expect(executedAgreement({id:1,token_values_json:{draftKind:'provider_update_compensation',effectiveDate:'2026-10-10'},signed_pdf_path:'private/doc.pdf',audit_trail:{adminCountersign:{signedAt:'2026-10-14T13:00:00Z'}}})).toMatchObject({agreementDate:'2026-10-10',effectiveOn:'2026-10-14'});});
 it('splits service dates across the amendment boundary and preserves the earlier schedule',()=>{
  const old={...profile,compensationPolicyVersion:null,creditRate:50,autoIndirectMinutesPerHour:10};
  const args={assignment,providerStartDate:'2024-01-01',periodEnd:'2026-10-16',benefitTierLevel:1};
  const end={...status('2026-10-16',{benefitTierLevel:1}),agreementBoundary:'2026-10-10',agreementPriorRateProfile:old,agreementLegacyAssignment:{waive_probation:1,waive_minimum_workload:1},agreementStatusArgs:args};
  const breakdown={'90837':{units:2,finalizedUnits:2,category:'direct'}};
  const meta=applyPaySystemToBreakdown({breakdown,rateProfile:profile,status:end,datedUnitsByCode:new Map([['90837',[{serviceDate:'2026-10-09',units:1},{serviceDate:'2026-10-10',units:1}]]])});
  expect(meta.servicePay).toBe(94);expect(meta.leaveBasis.direct).toBe(1);expect(meta.leaveBasis.legacyPaidBasis).toBe(1);
 });
 it('requires dates for old carryovers instead of silently changing their pay',()=>{expect(()=>applyPaySystemToBreakdown({breakdown:{'90837':{units:1}},rateProfile:profile,status:{agreementBoundary:'2026-10-10'}})).toThrow('Service dates are required');});
});

it('calculator renders H-code indirect-rate details without losing the probation rate',()=>{const result=line('H0004',4,{useReducedRates:true});expect(()=>decorateEstimateLine(result,profile)).not.toThrow();});

it('preserves Colorado sick carryover and higher promised limits',()=>{expect(protectedSickRolloverLimit({agencyId:2,configuredLimit:10})).toBe(48);expect(protectedSickRolloverLimit({agencyId:2,configuredLimit:65})).toBe(65);});
it('keeps a fully explicit fractional H-code calculation',()=>{expect(line('H0004',1)).toMatchObject({amount:8,autoIndirectHours:1/24,autoIndirectAmount:.92,totalWithAutoIndirect:8.92});});


describe('Tier 3 conditional level additions',()=>{
 const agreement=(category,level,version=COMPENSATION_POLICY_VERSION)=>({effectiveOn:'2026-10-10',data:{compensationPolicyVersion:version,schedule:{...profile,category,level}}});
 it.each([[1,0],[2,0],[3,2],[4,1],[5,3]])('keeps level %s bonus separate from its base', (level,bonus)=>{
  const p=agreementRateProfile(profile,agreement(2,level));
  expect(p.creditRate).toBe(44);
  expect(computeBonuses({rateProfile:p,status:{tierLevel:3,currentTierLevel:3},totalHourEquivalent:3,ffsHourEquivalent:2,hcodeHourEquivalent:1}).tierBonusAmount).toBe(2*bonus);
  expect(computeBonuses({rateProfile:p,status:{tierLevel:3,currentTierLevel:2},totalHourEquivalent:3}).tierBonusAmount).toBe(0);
 });
 it('pays Category 1 additions for both clinical and H-code equivalents without automatic indirect',()=>{
  const p=agreementRateProfile(profile,agreement(1,3));
  expect(computeBonuses({rateProfile:p,status:{tierLevel:3},totalHourEquivalent:3,ffsHourEquivalent:2,hcodeHourEquivalent:1}).tierBonusAmount).toBe(6);
  expect(computeLineAmount({rateProfile:p,status:{},serviceCode:'H0004',quantity:4}).autoIndirectHours).toBe(0);
 });
 it('does not rewrite already signed v2 terms or retained benefit tier bonuses',()=>{
  const old={...profile,tierBonus:{3:4},autoIndirectMinutesPerHour:12};
  const p=agreementRateProfile(old,agreement(2,3,'itsco-2026-10-service-credit-v2'));
  expect(p.autoIndirectMinutesPerHour).toBe(12);
  expect(computeBonuses({rateProfile:p,status:{tierLevel:3,currentTierLevel:2},totalHourEquivalent:2}).tierBonusAmount).toBe(8);
 });
 it('keeps old and new bonuses on their respective service dates across an amendment',()=>{
  const p=agreementRateProfile(profile,agreement(2,3));
  const old={...profile,compensationPolicyVersion:null,tierBonus:{3:4}};
  const assignment={compensation_policy_version:COMPENSATION_POLICY_VERSION,compensation_agreement_effective_on:'2026-10-10',waive_probation:1};
  const args={assignment,providerStartDate:'2024-01-01',periodEnd:'2026-10-16',benefitTierLevel:3,displayTierLevel:3};
  const status={...resolveUserPaySystemStatus(args),agreementBoundary:'2026-10-10',agreementPriorRateProfile:old,agreementLegacyAssignment:{waive_probation:1,waive_minimum_workload:1},agreementStatusArgs:args};
  const breakdown={'90837':{units:2,finalizedUnits:2,category:'direct'}};
  const meta=applyPaySystemToBreakdown({breakdown,rateProfile:p,status,datedUnitsByCode:new Map([['90837',[{serviceDate:'2026-10-09',units:1},{serviceDate:'2026-10-10',units:1}]]])});
  expect(meta.bonuses.tierBonusAmount).toBe(6);
  expect(meta.bonuses.tierBonusPerFfsHour).toBeNull();
 });
 it('counts H-code direct and ten-minute indirect hours once for sick leave',()=>{
  const breakdown={H0004:{units:100,category:'direct'}};
  const meta=applyPaySystemToBreakdown({breakdown,rateProfile:profile,status:{}});
  expect(meta.leaveBasis.direct).toBe(25);
  expect(meta.leaveBasis.indirect).toBeCloseTo(25/6,2);
  const earned=computeServiceCreditLeave({summaryRow:{direct_hours:25,indirect_hours:25/6,breakdown},policy:{},employmentType:'fee_for_service'});
  expect(earned.sickEarn).toBe(.97);
 });
});

it('uses the saved original agreement date for the remaining new-hire probation and ends it at workload Tier 3',()=>{
 const assignment={category:1,level:1,waive_probation:0,probation_start_override:'2026-09-12',compensation_policy_version:'itsco-2026-10-service-credit-v3',compensation_agreement_effective_on:'2026-10-10'};
 const args={assignment,providerStartDate:'2026-08-27',benefitTierLevel:1,displayTierLevel:1};
 expect(resolveUserPaySystemStatus({...args,periodEnd:'2026-11-25'}).inProbation).toBe(true);
 expect(resolveUserPaySystemStatus({...args,periodEnd:'2026-12-10'}).inProbation).toBe(true);
 expect(resolveUserPaySystemStatus({...args,periodEnd:'2026-12-11'}).inProbation).toBe(false);
 expect(resolveUserPaySystemStatus({...args,periodEnd:'2026-10-23',displayTierLevel:3}).inProbation).toBe(false);
 expect(resolveUserPaySystemStatus({...args,assignment:{...assignment,probation_ended_on:'2026-10-23'},periodEnd:'2026-11-06'}).inProbation).toBe(false);
});
