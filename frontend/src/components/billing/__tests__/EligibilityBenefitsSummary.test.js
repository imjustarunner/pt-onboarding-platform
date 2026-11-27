import {mount} from '@vue/test-utils';
import {it,expect} from 'vitest';
import Summary from '../EligibilityBenefitsSummary.vue';
const details=()=>({policies:[{memberIndex:0,planName:'Returned plan',groupNumber:'GROUP'}],benefits:[
 {id:'1',kind:'C',serviceCode:'MH',network:'Y',levelCode:'IND',periodCode:'23',amount:'1000',percent:'',quantity:'',authorizationRequired:''},
 {id:'2',kind:'C',serviceCode:'MH',network:'N',levelCode:'FAM',periodCode:'29',amount:'0',percent:'',quantity:'',authorizationRequired:''},
 {id:'3',kind:'A',serviceCode:'A6',network:'Y',levelCode:'IND',periodCode:'27',amount:'',percent:'50',quantity:'10',quantityType:'Visits',authorizationRequired:'Y'}],otherCoverageReported:true,otherInsurance:[{id:'0:1:0',name:'Other payer',reportedPolicyNumber:'REFERENCE',role:'SEP',phone:'5550100',canDraft:true}]});
const annual=()=>({id:'0:1',serviceCode:'MH',network:'Y',levelCode:'IND',periodLabel:'Calendar year',basis:'calendar_year',startDate:'2026-01-01',endDate:'2026-12-31',expectedResetDate:'2027-01-01',reviewOnDate:'2027-01-01',messages:[]});
it('shows the expected reset, source date and benefit context without sending a request or marking liability',()=>{
 const data={...details(),deductiblePeriods:[annual()]};const w=mount(Summary,{props:{details:data,checkId:317,serviceDate:'2026-11-26',identityMatches:true,isCurrent:true}});
 const section=w.get('[aria-label="Deductible period and reset"]');expect(section.text()).toContain('01/01/2027');expect(section.text()).toContain('In network · Individual');expect(section.text()).toContain('payer’s Calendar Year classification');expect(section.text()).toContain('Refresh benefits before visits on or after 01/01/2027');expect(w.emitted()).toEqual({});w.unmount();
});
it('shows returned non-calendar dates while leaving an unestablished reset unknown',()=>{
 const period={...annual(),basis:'reported_dates',periodLabel:'Service year',startDate:'2026-07-01',endDate:'2027-06-30',expectedResetDate:'',reviewOnDate:'2027-07-01'};
 const w=mount(Summary,{props:{details:{...details(),deductiblePeriods:[period]}}});const section=w.get('[aria-label="Deductible period and reset"]');
 expect(section.text()).toContain('07/01/2026 — 06/30/2027');expect(section.text()).toContain('Not established — confirm with payer');expect(section.text()).toContain('Refresh benefits before visits on or after 07/01/2027');expect(section.text()).not.toContain('01/01/2027');w.unmount();
});
it('shows a supported fiscal service-year reset with the returned-date explanation',()=>{
 const period={...annual(),basis:'service_year',periodLabel:'Service year',startDate:'2026-07-01',endDate:'2027-06-30',expectedResetDate:'2027-07-01',reviewOnDate:'2027-07-01'};
 const w=mount(Summary,{props:{details:{deductiblePeriods:[period]}}});const section=w.get('[aria-label="Deductible period and reset"]');expect(section.text()).toContain('07/01/2027');expect(section.text()).toContain('returned full-year dates');w.unmount();
});
it('does not guess a January reset from the policy coverage dates when no deductible period was returned',()=>{
 const w=mount(Summary,{props:{details:{...details(),policies:[{memberIndex:0,effectiveDate:'2026-01-01',terminationDate:'2026-12-31'}]},serviceDate:'2026-11-26'}});
 expect(w.get('[aria-label="Deductible period and reset"]').text()).toContain('Deductible reset date not provided');expect(w.get('[aria-label="Deductible period and reset"]').text()).not.toContain('01/01/2027');w.unmount();
});
it('keeps long deductible findings compact and expands them on request',async()=>{
 const w=mount(Summary,{props:{details:{deductiblePeriods:Array.from({length:7},(_,i)=>({...annual(),id:String(i)}))}}});const section=w.get('[aria-label="Deductible period and reset"]');
 expect(section.findAll('article')).toHaveLength(4);await section.get('button').trigger('click');expect(section.findAll('article')).toHaveLength(7);w.unmount();
});
it('displays distinct benefit contexts, zero amounts, documented percentages and the source date',()=>{
 const w=mount(Summary,{props:{details:details(),checkId:317,serviceDate:'2026-11-22',identityMatches:true,isCurrent:true}});
 expect(w.text()).toContain('check #317');expect(w.text()).toContain('11/22/2026');expect(w.findAll('tbody tr')).toHaveLength(3);
 const rows=w.findAll('tbody tr');expect(rows[0].text()).toContain('Individual');expect(rows[0].text()).toContain('Calendar year');expect(rows[1].text()).toContain('$0.00');expect(rows[1].text()).toContain('Family');expect(rows[1].text()).toContain('Remaining');expect(rows[2].text()).toContain('50%');expect(rows[2].text()).not.toContain('5000%');expect(rows[2].text()).toContain('Authorization: Required');
 expect(w.text()).toContain('Reported policy/reference number: REFERENCE');expect(w.text()).toContain('Other insurance reported');w.unmount();
});
it('offers only explicitly selected empty draft positions and disables actions for unsaved edits',async()=>{
 const w=mount(Summary,{props:{details:details(),checkId:317,identityMatches:true,isCurrent:true,allowDraft:true,allowImport:true,availableSlots:['secondary']}});
 const secondary=w.findAll('button').find(b=>b.text()==='Add as secondary draft'),primary=w.findAll('button').find(b=>b.text()==='Add as primary draft');
 expect(primary.attributes('disabled')).toBeDefined();await secondary.trigger('click');expect(w.emitted('draft-policy')[0]).toEqual([{candidateId:'0:1:0',slot:'secondary'}]);
 await w.setProps({dirty:true});expect(secondary.attributes('disabled')).toBeDefined();expect(w.findAll('button').find(b=>b.text().startsWith('Fill missing')).attributes('disabled')).toBeDefined();w.unmount();
});
it('never offers imports for historical or unmatched evidence and escapes payer text',()=>{
 const data=details();data.otherInsurance[0].name='<script>UNTRUSTED</script>';
 for(const props of [{isCurrent:false,identityMatches:true},{isCurrent:true,identityMatches:false}]){
  const w=mount(Summary,{props:{details:data,allowDraft:true,allowImport:true,...props}});expect(w.find('script').exists()).toBe(false);expect(w.text()).toContain('<script>UNTRUSTED</script>');expect(w.findAll('button')).toHaveLength(0);w.unmount();
 }
});
it('shows conflicting staff values for review without emitting a change or assuming missing benefits are zero',()=>{
 const data=details();data.benefits=[{id:'unknown',kind:'B',amount:'',percent:'',quantity:''}];
 const w=mount(Summary,{props:{details:data,currentPolicy:{planName:'Staff plan'}}});
 expect(w.text()).toContain('Saved: Staff plan · Returned: Returned plan');expect(w.text()).toContain('Not returned');expect(w.text()).not.toContain('$0.00');expect(w.emitted()).toEqual({});w.unmount();
});
