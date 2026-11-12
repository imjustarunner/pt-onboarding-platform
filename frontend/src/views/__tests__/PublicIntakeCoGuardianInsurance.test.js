import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import View from '../PublicIntakeSigningView.vue';
import Standalone from '../../components/public-intake/PublicIntakeInsuranceStep.vue';
import Combined from '../../components/public-intake/PublicIntakeInsurancePaymentStep.vue';
const {get,post,route}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),route:{params:{publicKey:'own-bound-form'},query:{session:'own-bound-session'},path:'/intake/own-bound-form'}}));
vi.mock('../../services/api',()=>({default:{get,post,put:vi.fn(),defaults:{baseURL:'/api'}}}));
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>({replace:vi.fn(),push:vi.fn()})}));
vi.mock('../../components/documents/PDFPreview.vue',()=>({default:{template:'<div />'}}));
let wrapper,progress;
beforeEach(()=>{localStorage.clear();sessionStorage.clear();window.scrollTo=vi.fn();Element.prototype.scrollIntoView=vi.fn();post.mockReset().mockResolvedValue({data:{}});});
afterEach(()=>wrapper?.unmount());
async function render(scope='school',locale='en',{allOnFile=true,own=false,paymentAvailable=false,separatePayment=false,insuranceInfo={primary:{insurerName:'',isMedicaid:true},medicaidByClient:[{clientIndex:0,memberId:'OLD-A'},{clientIndex:1,memberId:'OLD-B'}]}}={}){
 const clients=[{id:201,firstName:'First',lastName:'QA',dateOfBirth:'2015-01-01',insuranceOnFile:true},{id:202,firstName:'Second',lastName:'QA',dateOfBirth:'2017-01-01',insuranceOnFile:allOnFile}];
 progress={submissionId:303,coGuardianInvite:{dependents:clients,paymentCollectionAvailable:paymentAvailable},intakeData:{progressSnapshot:{version:1,sessionToken:route.query.session,submissionId:303,step:2,currentFlowIndex:0,currentFlowStepId:'insurance',intakeForSelf:false,coGuardianAdditionalInsurance:own,guardian:{firstName:'Own',lastName:'Guardian',email:'testing+own@itsco.health'},clients,intakeResponses:{submission:{insuranceInfo},clients:[{ownAnswer:'parent-two-1'},{ownAnswer:'parent-two-2'}]}}}};
 get.mockReset().mockImplementation(async url=>({data:url.endsWith('/progress')?progress:url==='/public-intake/own-bound-form'?{link:{id:1,scope_type:scope,agency_id:450,organization_id:scope==='school'?451:450,form_type:'intake',inherits_office_master:scope==='agency'?1:0,master_channel:'counseling',language:locale,intake_fields:[],intake_steps:[{id:'insurance',type:'insurance_info',paymentRequired:false},...(separatePayment?[{id:'payment',type:'payment_collection',paymentRequired:false}]:[]),{id:'communications',type:'communications'}]},agency:{id:450,name:'QA Agency'},organization:{id:scope==='school'?451:450,name:'QA Organization',organization_type:scope},templates:[]}:{} }));
 wrapper=mount(View,{global:{plugins:[createPinia()],directives:{'address-autocomplete':{}},stubs:{DigitalFormShell:{template:'<main><slot /></main>'},SignaturePad:true,SecureCardSetup:true}}});await flushPromises();wrapper.vm.step=2;wrapper.vm.currentFlowIndex=wrapper.vm.flowSteps.findIndex(s=>s.type==='insurance_info');await flushPromises();return wrapper;
}
it.each([['school','en'],['school','es'],['agency','en'],['agency','es']])('uses bound existing coverage without fresh-policy gates in %s/%s',async(scope,locale)=>{
 const w=await render(scope,locale);
 expect(w.vm.useCoGuardianInsuranceOnFile).toBe(true);
 expect(w.findComponent(Standalone).exists()).toBe(false);expect(w.findComponent(Combined).exists()).toBe(false);
 expect(w.find('.insurance-step .notice').exists()).toBe(true);
 await w.vm.handleCurrentFlowContinue();await flushPromises();
 expect(w.vm.stepError).toBe('');expect(w.vm.currentFlowStep.type).toBe('communications');
 expect(w.vm.intakeResponses.submission.insuranceInfo).toEqual({useInsuranceOnFile:true,isSelfPay:false});
 expect(w.vm.clients.map(c=>c.id)).toEqual([201,202]);expect(w.vm.intakeResponses.clients.map(c=>c.ownAnswer)).toEqual(['parent-two-1','parent-two-2']);
 expect(post.mock.calls.some(([url])=>url.endsWith('/insurance-card-photos'))).toBe(false);
});
it('restores explicit additional-insurance intent and independently validates that new policy',async()=>{
 const w=await render('school','en',{own:true,insuranceInfo:{useInsuranceOnFile:false,primary:{insurerName:'Commercial',memberId:'OWN-ONLY'}}});
 expect(w.vm.useCoGuardianInsuranceOnFile).toBe(false);expect(w.findComponent(Standalone).exists()).toBe(true);
 await w.vm.handleCurrentFlowContinue();await flushPromises();expect(w.vm.currentFlowStep.type).toBe('insurance_info');
 expect(w.vm.intakeResponses.submission.insuranceInfo.useInsuranceOnFile).toBe(false);
 expect(w.vm.intakeResponses.submission.insuranceInfo.primary.memberId).toBe('OWN-ONLY');
 expect(w.vm.buildDraftSnapshot().coGuardianAdditionalInsurance).toBe(true);
});
it('does not offer the on-file shortcut when one bound sibling has no recorded coverage',async()=>{
 const w=await render('school','en',{allOnFile:false,insuranceInfo:{}});
 expect(w.vm.useCoGuardianInsuranceOnFile).toBe(false);expect(w.findComponent(Standalone).exists()).toBe(true);
 await w.vm.handleCurrentFlowContinue();await flushPromises();expect(w.vm.currentFlowStep.type).toBe('insurance_info');
});
it('records a deliberate additional-policy choice instead of retaining a stale use-on-file marker',async()=>{
 const w=await render('school','en',{insuranceInfo:{useInsuranceOnFile:true,isSelfPay:false}});
 await w.find('.insurance-step .notice input').setValue(true);await flushPromises();
 expect(w.vm.intakeResponses.submission.insuranceInfo.useInsuranceOnFile).toBe(false);expect(w.findComponent(Standalone).exists()).toBe(true);
 expect(w.find('.public-intake-school-payment').exists()).toBe(false);
});
it.each([false,true])('suppresses a separate payment step over stored Medicaid even with additional commercial selected=%s',async own=>{
 const w=await render('school','en',{own,separatePayment:true,insuranceInfo:own?{useInsuranceOnFile:false,payerChoice:'insurance',primary:{insurerName:'Commercial',memberId:'OWN'}}:{useInsuranceOnFile:true,isSelfPay:false}});
 expect(w.vm.flowSteps.some(s=>s.type==='payment_collection')).toBe(false);
 if(!own){await w.vm.handleCurrentFlowContinue();await flushPromises();expect(w.vm.currentFlowStep.type).toBe('communications');}
 expect(w.find('.payment-step').exists()).toBe(false);
});
it('preserves the separate commercial payment step when the server permits collection',async()=>{
 const w=await render('school','en',{own:true,paymentAvailable:true,separatePayment:true,insuranceInfo:{useInsuranceOnFile:false,payerChoice:'insurance',primary:{insurerName:'Commercial',memberId:'OWN'}}});
 expect(w.vm.flowSteps.some(s=>s.type==='payment_collection')).toBe(true);
});
