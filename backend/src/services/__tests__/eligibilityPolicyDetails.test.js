import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import {eligibilityPolicyDetails,eligibilityPolicyFields,otherInsuranceBenefit} from '../../utils/eligibilityPolicyDetails.js';
import {preserveEligibilityFieldSources,normalizePolicy} from '../clientInsurance.service.js';
import {coverageInsuranceFingerprint} from '../../utils/paperInsuranceReviewGate.js';
const deductible=(extra={})=>({benefit_coverage_code:'C',benefit_code:'MH',inplan_network:'Y',benefit_level_code:'IND',benefit_period_code:'23',benefit_amount:'1000',...extra});
const periodDetails=(benefits,options={})=>eligibilityPolicyDetails({elig:{plan_begin_date:'20260701',plan_end_date:'20270630',benefit:benefits}},{serviceDate:'2026-11-26',...options});
it('derives a calendar-year reset from the checked service year, never the coverage start or today',()=>{
 const result=periodDetails([deductible()]);
 expect(result.deductiblePeriods[0]).toMatchObject({serviceCode:'MH',network:'Y',levelCode:'IND',basis:'calendar_year',startDate:'2026-01-01',endDate:'2026-12-31',expectedResetDate:'2027-01-01',reviewOnDate:'2027-01-01'});
 expect(periodDetails([deductible()],{serviceDate:'2025-12-31'}).deductiblePeriods[0].expectedResetDate).toBe('2026-01-01');
 expect(periodDetails([deductible()],{serviceDate:new Date('2024-02-29T00:00:00Z')}).deductiblePeriods[0].expectedResetDate).toBe('2025-01-01');
});
it('keeps non-calendar benefit dates separate from a deductible reset and accepts explicit date ranges',()=>{
 for(const benefit of [deductible({benefit_period_code:'25',benefit_begin:'20260701-20270630'}),deductible({benefit_period_code:'25',benefit_begin:'2026-07-01/2027-06-30'})]) {
  const p=periodDetails([benefit]).deductiblePeriods[0];expect(p).toMatchObject({startDate:'2026-07-01',endDate:'2027-06-30',reviewOnDate:'2027-07-01',expectedResetDate:'',basis:'reported_dates'});
 }
});
it('uses a complete returned service year for a fiscal reset, holding incomplete or ambiguous year boundaries',()=>{
 const fiscal=periodDetails([deductible({benefit_period_code:'22',benefit_begin:'20260701',benefit_end:'20270630'})]);
 expect(fiscal.deductiblePeriods[0]).toMatchObject({basis:'service_year',expectedResetDate:'2027-07-01',reviewOnDate:'2027-07-01'});
 for(const extra of [{benefit_begin:'20260701'},{benefit_begin:'20260701',benefit_end:'20261231'},{benefit_begin:'20260701',benefit_end:'20280630'}]) {
  expect(periodDetails([deductible({benefit_period_code:'22',...extra})]).deductiblePeriods[0].expectedResetDate).toBe('');
 }
 expect(periodDetails([deductible({benefit_period_code:'22',benefit_begin:'20240229',benefit_end:'20250228'})],{serviceDate:'2024-11-26'}).deductiblePeriods[0].expectedResetDate).toBe('');
});
it('does not infer a reset from coverage dates, remaining amounts, out-of-pocket limits or another service/network/level',()=>{
 expect(periodDetails([{benefit_code:'30',benefit_coverage_code:'1'}]).deductiblePeriods).toEqual([]);
 const rows=[deductible(),deductible({benefit_period_code:'29',benefit_amount:'0'}),deductible({benefit_code:'30',benefit_period_code:'29'}),deductible({inplan_network:'N',benefit_period_code:'29'}),deductible({benefit_level_code:'FAM',benefit_period_code:'29'}),deductible({benefit_coverage_code:'G'})];
 const periods=periodDetails(rows).deductiblePeriods;expect(periods).toHaveLength(4);expect(periods.filter(p=>p.expectedResetDate)).toHaveLength(1);
 expect(periods.find(p=>p.serviceCode==='30')).toMatchObject({expectedResetDate:'',startDate:'',endDate:''});
 expect(periods.find(p=>p.levelCode==='FAM').expectedResetDate).toBe('');
});
it.each([
 {benefit_begin:'20260230'},
 {benefit_begin:'20261231-20260101'},
 {benefit_begin:'20260101-20261231',benefit_end:'20261130'},
 {benefit_begin:'20260101',benefit_end:'20260701-20261231'},
 {benefit_begin:'20270101',benefit_end:'20271231'}
])('holds invalid or conflicting calendar-year dates for review: %j',extra=>{
 const p=periodDetails([deductible(extra)]).deductiblePeriods[0];expect(p).toMatchObject({expectedResetDate:'',reviewOnDate:'',basis:'conflicting'});expect(p.messages.length).toBeGreaterThan(0);
});
it('keeps benefit validity separate from calendar-year deductible accounting and reviews an earlier coverage boundary',()=>{
 for(const extra of [{benefit_begin:'20190101'},{benefit_begin:'20260701',benefit_end:'20270630'}]) {
  expect(periodDetails([deductible(extra)]).deductiblePeriods[0]).toMatchObject({basis:'calendar_year',startDate:'2026-01-01',endDate:'2026-12-31',expectedResetDate:'2027-01-01'});
 }
 expect(periodDetails([deductible({benefit_begin:'20260101',benefit_end:'20261130'})]).deductiblePeriods[0]).toMatchObject({expectedResetDate:'2027-01-01',reviewOnDate:'2026-12-01',reportedEndDate:'2026-11-30'});
});
it('requires a valid checked date and preserves payer conditions instead of declaring unconditional benefits',()=>{
 for(const serviceDate of [undefined,'invalid','2026-02-30'])expect(periodDetails([deductible()],{serviceDate}).deductiblePeriods[0].expectedResetDate).toBe('');
 const p=periodDetails([deductible({benefit_notes:'Carryover rules apply; contact the plan.'})]).deductiblePeriods[0];expect(p.messages[0]).toContain('conditions');
});
it('keeps other-payer and member contexts separate and flags incompatible periods in the same context',()=>{
 const other=deductible({entity:{entity_code:'SEP',entity_name:'Other insurance'}});expect(periodDetails([other]).deductiblePeriods).toEqual([]);
 const result=eligibilityPolicyDetails({elig:[{benefit:[deductible()]},{benefit:[deductible({benefit_period_code:'25'})]}]},{serviceDate:'2026-11-26'});expect(result.deductiblePeriods.map(p=>p.basis)).toEqual(['calendar_year','not_provided']);
 const conflict=periodDetails([deductible(),deductible({benefit_period_code:'25',benefit_begin:'20260701',benefit_end:'20270630'})]);
 expect(conflict.deductiblePeriods).toHaveLength(2);expect(conflict.deductiblePeriods.every(p=>!p.expectedResetDate&&!p.reviewOnDate&&p.basis==='conflicting')).toBe(true);
});
it('deduplicates identical annual rows with their source links and reviews contradictory remaining dates',()=>{
 const duplicate=periodDetails([deductible(),deductible(),deductible({benefit_period_code:'29',benefit_amount:'0'})]);
 expect(duplicate.deductiblePeriods).toHaveLength(1);expect(duplicate.deductiblePeriods[0].sourceBenefitIds).toEqual(['0:0','0:1']);
 const conflict=periodDetails([deductible(),deductible({benefit_period_code:'29',benefit_begin:'20270101',benefit_end:'20271231'})]);
 expect(conflict.deductiblePeriods[0]).toMatchObject({basis:'conflicting',expectedResetDate:'',reviewOnDate:''});
 expect(conflict.deductiblePeriods[0].messages.join(' ')).toContain('Remaining');
});
it('preserves legacy and explicitly blank optional field shapes so unchanged saves do not change coverage fingerprints',()=>{
 const legacy=normalizePolicy({insurerName:'Payer',payerId:'TEST',memberId:'MEMBER'});
 for(const field of ['planName','planNumber','groupName','payerPhone','payerAddressLine1','payerCity','payerState','payerPostalCode','reportedPolicyNumber'])expect(legacy).not.toHaveProperty(field);
 const initial={primary:legacy,patient:{firstName:'Test',lastName:'Person',dateOfBirth:'2000-01-01'}};
 expect(coverageInsuranceFingerprint({...initial,primary:normalizePolicy(legacy)})).toBe(coverageInsuranceFingerprint(initial));
 const explicit={...legacy,planName:''};expect(normalizePolicy(explicit)).toEqual(explicit);
 expect(coverageInsuranceFingerprint({...initial,primary:normalizePolicy(explicit)})).toBe(coverageInsuranceFingerprint({...initial,primary:explicit}));
});
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
