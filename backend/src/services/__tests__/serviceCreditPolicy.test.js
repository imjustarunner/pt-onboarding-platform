import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {decorateEstimateLine,computeLineAmount,resolveUserPaySystemStatus,applyPaySystemToBreakdown} from '../paySystem.service.js';
import {executedAgreement,probationEndDate,COMPENSATION_POLICY_VERSION} from '../employmentAgreementPolicy.service.js';
import {computeServiceCreditLeave,protectedSickRolloverLimit} from '../../utils/payrollPtoAccrual.util.js';
const profile={category:2,level:2,creditRate:44,creditRateProbation:36,hcodeRate:32,hcodeRateProbation:28,indirectRate:22,indirectRateProbation:20,supportActivityRate:24,supportActivityRateProbation:21,autoIndirectMinutesPerHour:12,leaveAdminRatio:.2,compensationPolicyVersion:COMPENSATION_POLICY_VERSION};
const line=(serviceCode,quantity=1,status={})=>computeLineAmount({rateProfile:profile,status,serviceCode,quantity});
describe('signed service-credit compensation',()=>{
 it('pays a psychotherapy credit once, with no indirect cash supplement',()=>{expect(line('90837')).toMatchObject({amount:44,autoIndirectHours:0,autoIndirectAmount:0,totalWithAutoIndirect:44});});
 it('pays H0004 four units at direct plus 20% indirect',()=>{expect(line('H0004',4)).toMatchObject({hourEquivalent:1,amount:32,autoIndirectHours:.2,autoIndirectAmount:4.4,totalWithAutoIndirect:36.4});});
 it('uses each disclosed probation rate including indirect',()=>{expect(line('H0004',4,{useReducedRates:true})).toMatchObject({amount:28,autoIndirectHours:.2,autoIndirectAmount:4});expect(line('MEETING',1,{useReducedRates:true}).rate).toBe(21);});
 it('respects explicit zero instead of restoring a default allowance',()=>{expect(computeLineAmount({rateProfile:{...profile,autoIndirectMinutesPerHour:0},serviceCode:'H0004',quantity:4,status:{}}).autoIndirectHours).toBe(0);});
 it.each([['90837',25,25,0],['H0004',100,25,5]])('25 credits of %s earn exactly 1 sick hour without double multiplication',(code,units,direct,indirect)=>{
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
it('keeps a fully explicit fractional H-code calculation',()=>{expect(line('H0004',1)).toMatchObject({amount:8,autoIndirectHours:.05,autoIndirectAmount:1.1,totalWithAutoIndirect:9.1});});
