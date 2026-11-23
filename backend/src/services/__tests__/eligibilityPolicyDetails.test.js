import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import {eligibilityPolicyDetails,eligibilityPolicyFields,otherInsuranceBenefit} from '../../utils/eligibilityPolicyDetails.js';
import {preserveEligibilityFieldSources,normalizePolicy} from '../clientInsurance.service.js';
it('keeps financial benefits separate by network, family level, period and service, including zero values',()=>{
 const rows=[{benefit_coverage_code:'C',benefit_code:'MH',benefit_level_code:'IND',inplan_network:'Y',benefit_period_code:'23',benefit_amount:'1000'},
 {benefit_coverage_code:'C',benefit_code:'MH',benefit_level_code:'FAM',inplan_network:'N',benefit_period_code:'29',benefit_amount:'0'},
 {benefit_coverage_code:'A',benefit_code:'A6',benefit_percent:'50',authorization_required:'Y',benefit_qnty:'10',benefit_qnty_type_code:'VS'}];
 const details=eligibilityPolicyDetails({result:{elig:{benefit:rows}}});
 expect(details.benefits).toHaveLength(3);expect(details.benefits[1]).toMatchObject({amount:'0',network:'N',levelCode:'FAM',periodCode:'29'});
 expect(details.benefits[2]).toMatchObject({percent:'50',authorizationRequired:'Y',quantity:'10',quantityType:'VS'});
 expect(details).not.toHaveProperty('copay');
});
it('finds nested other-payer entities without treating entity IDs or the checked member ID as another policy',()=>{
 const result={elig:{ins_number:'CURRENT-MEMBER',benefit:[{benefit_coverage_code:'R',policy_number:'REPORTED-REFERENCE',entity:[{entity_code:'SEP',entity_name:'Other coverage',entity_id:'NOT-A-ROUTE',entity_phone:'5550100'},{entity_code:'P3',entity_name:'Primary care clinician'}]}]}};
 const details=eligibilityPolicyDetails(result);
 expect(details.otherCoverageReported).toBe(true);expect(details.otherInsurance).toHaveLength(1);
 expect(details.otherInsurance[0]).toMatchObject({name:'Other coverage',role:'SEP',reportedEntityId:'NOT-A-ROUTE',policy:{insurerName:'Other coverage',reportedPolicyNumber:'REPORTED-REFERENCE',payerPhone:'5550100'}});
 expect(details.otherInsurance[0].policy).not.toHaveProperty('memberId');expect(details.otherInsurance[0].policy).not.toHaveProperty('payerId');
 expect(otherInsuranceBenefit({entity:{entity_code:'TTP'}},'commercial')).toBe(true);
});
it('keeps generic commercial referrals separate from Colorado Medicaid TPL findings',()=>{
 const b={benefit_coverage_code:'U',entity:{entity_code:'VN',entity_name:'Pharmacy'}};
 expect(otherInsuranceBenefit(b,'commercial')).toBe(false);expect(otherInsuranceBenefit(b,'SKCO0')).toBe(true);
 expect(eligibilityPolicyDetails({elig:{benefit:b}},{payerId:'commercial'}).otherInsurance).toEqual([]);
});
it('retains unknown other coverage and deduplicates repeated carrier findings',()=>{
 const b={benefit_coverage_code:'R',entity_name:'Other payer',policy_number:'REFERENCE'};
 expect(eligibilityPolicyDetails({elig:{benefit:[b,b]}}).otherInsurance).toHaveLength(1);
 expect(eligibilityPolicyDetails({elig:{benefit:{benefit_coverage_code:'R'}}}).otherInsurance[0]).toMatchObject({canDraft:false});
});
it('imports only unambiguous dates and contact records, retaining ambiguous dates in the snapshot',()=>{
 const entry={plan_name:'Plan',group_name:'Group',plan_number:'PLAN-1',plan_begin_date:'20260101-20261231',policy_effective_date:'bad',plan_end_date:'20261231',benefit:[{benefit_code:'30',benefit_coverage_code:'1',entity:{entity_code:'PR',entity_name:'Payer',entity_phone:'5550101'}}]};
 expect(eligibilityPolicyFields(entry)).toMatchObject({planName:'Plan',planNumber:'PLAN-1',groupName:'Group',effectiveDate:'',terminationDate:'2026-12-31',payerPhone:'5550101'});
 expect(eligibilityPolicyDetails({elig:entry}).policies[0].reportedBeginDate).toBe('20260101-20261231');
 entry.benefit.push({benefit_code:'30',entity:{entity_code:'PR',entity_name:'Conflicting payer',entity_phone:'5550102'}});
 expect(eligibilityPolicyFields(entry)).toMatchObject({insurerName:'',payerPhone:''});
});
it('does not fill the checked policy contact from Colorado TPL entries',()=>{
 const entry={benefit:[{benefit_code:'30',benefit_coverage_code:'U',entity:{entity_code:'PR',entity_name:'Other coverage',entity_phone:'5550100'}}]};
 expect(eligibilityPolicyFields(entry,'SKCO0').payerPhone).toBe('');
});
it('preserves field sources only for unchanged values on the same policy and carries them across a swap',()=>{
 const source={checkId:317,value:'Returned plan'},primary={insurerName:'Payer',payerId:'TEST',memberId:'MEMBER',planName:'Returned plan'},previous={primary,eligibilityFieldSources:{primary:{planName:source}}};
 expect(preserveEligibilityFieldSources(previous,{primary})).toEqual(previous.eligibilityFieldSources);
 expect(preserveEligibilityFieldSources(previous,{secondary:primary})).toEqual({secondary:{planName:source}});
 expect(preserveEligibilityFieldSources(previous,{primary:{...primary,planName:'Manual edit'}})).toEqual({});
 expect(preserveEligibilityFieldSources(previous,{primary:{...primary,memberId:'OTHER'}})).toEqual({});
 expect(preserveEligibilityFieldSources({}, {primary,eligibilityFieldSources:previous.eligibilityFieldSources})).toEqual({});
 expect(normalizePolicy({...primary,eligibilityFieldSources:{planName:source}})).not.toHaveProperty('eligibilityFieldSources');
});
