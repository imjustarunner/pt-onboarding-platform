import {mount,flushPromises} from '@vue/test-utils';
import {describe,it,expect} from 'vitest';
import {createRouter,createMemoryHistory} from 'vue-router';
import BillingPayerRules from '../BillingPayerRules.vue';
import BillingSectionNav from '../BillingSectionNav.vue';
import InsurancePolicyFields from '../InsurancePolicyFields.vue';
import {policyIsMedicaid} from '../../../navigation/insurancePaymentPolicy.js';
const programs=[{id:'commercial',label:'Commercial'},{id:'medicaid',label:'Medicaid'},{id:'tricare',label:'TRICARE'},{id:'medicare',label:'Medicare'}];
const rules=()=>({available:true,revision:3,programs,payers:[{payerId:'UNITED',name:'United',programs:['commercial','medicaid']}],programTiers:{commercial:{intern_plus:true},medicaid:{intern_plus:true}},overrides:[]});
describe('payer setup controls',()=>{
 it('supports both coverage categories on a single payer without opening an unscoped exception',async()=>{
  const w=mount(BillingPayerRules,{props:{rules:rules(),tiers:[{id:'intern_plus',label:'Licensed / prelicensed'}],codes:[{code:'H0004',description:'Counseling',payerPrograms:{commercial:false,medicaid:true}}]}});
  const checks=w.findAll('.program-chip input');expect(checks[0].element.checked).toBe(true);expect(checks[1].element.checked).toBe(true);
  await checks[2].setValue(true);expect(w.emitted('change')[0][0]).toMatchObject({kind:'payer_programs',payerId:'UNITED',programs:['commercial','medicaid','tricare']});
  await w.findAll('button').find(b=>b.text()==='Individual service override').trigger('click');
  const panel=w.find('[aria-label="Individual payer service overrides"]');expect(panel.find('select').element.value).toBe('');expect(panel.find('button:last-child').exists()).toBe(true);
  const save=()=>panel.findAll('button').find(b=>b.text()==='Save override');expect(save().element.disabled).toBe(true);
  await panel.find('select').setValue('medicaid');const inputs=panel.findAll('input');await inputs[1].setValue('2026-11-01');await inputs[2].setValue('2026-11-30');await inputs[3].setValue('Payer confirmed this exact exception');await inputs[4].setValue('Policy confirmation 2026-11-01');await panel.find('[aria-label="Override H0004"]').setValue('allow');await save().trigger('click');
  expect(w.emitted('change').at(-1)[0]).toMatchObject({kind:'payer_service',payerId:'UNITED',program:'medicaid',serviceCode:'H0004',allowed:true,effectiveFrom:'2026-11-01',effectiveThrough:'2026-11-30'});w.unmount();
 });
 it('selects Billing rules on the first click in the embedded settings host',async()=>{
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/settings',component:{template:'<div />'}}]});await router.push('/settings?agencyId=2&category=general&item=service-codes');await router.isReady();
  let selected='service-codes';const w=mount(BillingSectionNav,{props:{current:'service-codes'},global:{plugins:[router],provide:{selectBillingSettings:async item=>{selected=item;await router.replace({path:'/settings',query:{agencyId:2,category:'general',item}});}}}});
  await w.findAll('a').find(a=>a.text()==='Billing rules').trigger('click',{button:0});await flushPromises();expect(selected).toBe('billing-rules');expect(router.currentRoute.value.query.item).toBe('billing-rules');expect(router.currentRoute.value.query.agencyId).toBe('2');w.unmount();
 });
 it('records client coverage independently of the payer brand',async()=>{
  const w=mount(InsurancePolicyFields,{props:{modelValue:{insurerName:'United',isMedicaid:true}}});await w.find('select').setValue('commercial');const update=w.emitted('update:modelValue').at(-1)[0];expect(update).toMatchObject({programType:'commercial',isMedicaid:false});expect(policyIsMedicaid(update)).toBe(false);w.unmount();
 });
});
