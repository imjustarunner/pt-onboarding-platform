import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import {ref} from 'vue';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
import SchoolChildDetails from '../../components/public-intake/SchoolIntakeChildDetails.vue';
import PolicyFields from '../../components/billing/InsurancePolicyFields.vue';
import {createAddressAutocompleteDirective} from '../../directives/addressAutocomplete.js';
import {setPublicLocale} from '../../i18n';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),route:{params:{publicKey:'test-key'},query:{},path:'/intake/test-key'}}));
vi.mock('../../services/api.js',()=>({default:{get:m.get,post:m.post,put:vi.fn(),defaults:{baseURL:'/api'}}}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({replace:vi.fn(),push:vi.fn()})}));
vi.mock('../../components/documents/PDFPreview.vue',()=>({default:{template:'<div />'}}));
const address={street:'1600 Pennsylvania Avenue NW',city:'Washington',state:'DC',postalCode:'20500',formattedAddress:'1600 Pennsylvania Avenue NW, Washington, DC 20500, USA'};
const forms=[['office-intake-450-en-876e98bf5af05de5',false,'en'],['office-intake-450-es-1cadfe975924387d',false,'es'],['f243e3ac1cf550565687a32028d7ff535ad4965b7d47ce60',true,'en'],['a816de239557a6bbc0e953e085f6fd235c494f4ab936fc7e',true,'es']];
const fields=['street','city','state','zip','apt'].map(part=>({key:`guardian_${part==='street'?'address':part}`,type:'text',label:`Guardian ${part}`,scope:'guardian'}));
let wrapper;
beforeEach(()=>{localStorage.clear();sessionStorage.clear();setPublicLocale('en');window.scrollTo=vi.fn();Element.prototype.scrollIntoView=vi.fn();m.post.mockReset().mockImplementation(async url=>({data:url.endsWith('/suggest')?{suggestions:[{label:address.formattedAddress,selectionToken:'opaque'}]}:url.endsWith('/select')?{address}:{}}));});
afterEach(()=>{wrapper?.unmount();document.body.replaceChildren();setPublicLocale('en');});
const settle=async()=>{await new Promise(r=>setTimeout(r,5));await flushPromises();};
const directive=()=>createAddressAutocompleteDirective({client:{post:m.post},debounceMs:0});
async function choose(input){await input.setValue('1600 Penn');await settle();expect(input.attributes('aria-expanded')).toBe('true');await input.trigger('keydown',{key:'Enter'});await settle();}
async function render(key,school,locale){
 m.route.params.publicKey=key;m.route.path=`/intake/${key}`;history.replaceState({},'',m.route.path);
 const data={link:{id:1,form_type:'intake',scope_type:school?'school':'agency',organization_id:451,agency_id:450,inherits_office_master:school?0:1,master_channel:'counseling',language_code:locale,intake_fields:[],intake_steps:[{id:'guardian-address',type:'questions',audience:'guardian',fields},{id:'insurance',type:'insurance_info'}]},organization:{id:451,name:'QA School',organization_type:school?'school':'agency'},agency:{id:450,name:'QA Agency'},templates:[]};
 m.get.mockReset().mockImplementation(async url=>({data:url===`/public-intake/${key}`?data:{}}));
 wrapper=mount(PublicIntakeSigningView,{attachTo:document.body,global:{plugins:[createPinia()],directives:{'address-autocomplete':directive()},stubs:{DigitalFormShell:{template:'<main><slot /></main>'},SignaturePad:true,SecureCardSetup:true}}});await flushPromises();wrapper.vm.intakeForSelf=false;wrapper.vm.serviceSubject='dependent';wrapper.vm.clients=[{firstName:'Fictional',lastName:'One',dateOfBirth:'2015-01-01'},{firstName:'Fictional',lastName:'Two',dateOfBirth:'2016-01-01',sameAddressAsFirst:false}];wrapper.vm.intakeResponses.clients=[{address_city:'child one untouched'},{address_city:'child two untouched'}];wrapper.vm.submissionId=100;wrapper.vm.sessionToken='synthetic-session';wrapper.vm.step=2;wrapper.vm.currentFlowIndex=wrapper.vm.flowSteps.findIndex(s=>s.id==='guardian-address');await flushPromises();
}
describe('four distinct public intake links',()=>{
 it.each(forms)('fills guardian and primary subscriber groups through actual controls without crossing people (%s)',async(key,school,locale)=>{
  await render(key,school,locale);wrapper.vm.intakeResponses.guardian.guardian_apt='Apt7';await flushPromises();
  const guardianInput=wrapper.findAll('input[role=combobox]')[0];expect(guardianInput).toBeTruthy();await choose(guardianInput);
  expect(wrapper.vm.intakeResponses.guardian).toMatchObject({guardian_address:address.street,guardian_city:'Washington',guardian_state:'DC',guardian_zip:'20500',guardian_apt:'Apt7'});expect(wrapper.vm.intakeResponses.clients.map(x=>x.address_city)).toEqual(['child one untouched','child two untouched']);
  const request=m.post.mock.calls.find(([url])=>url.endsWith('/suggest'));expect(request[0]).toBe(`/address-lookup/intake/${key}/suggest`);expect(request[1].locale).toBe(locale);
  wrapper.vm.intakeResponses.submission.insuranceInfo={payerChoice:'insurance',coverageScope:'client',primary:{insurerName:'Commercial',subscriberAddressLine1:'Old Primary Street',subscriberCity:'Old Primary City',subscriberAddressLine2:'Unit9'},hasSecondary:true,secondary:{insurerName:'Other Commercial',subscriberAddressLine1:'Separate Secondary Street',subscriberCity:'Separate Secondary City'}};
  wrapper.vm.currentFlowIndex=wrapper.vm.flowSteps.findIndex(s=>s.type==='insurance_info');await flushPromises();const subscriber=wrapper.findAll('input').find(x=>x.element.value==='Old Primary Street');expect(subscriber).toBeTruthy();await choose(subscriber);
  expect(wrapper.vm.intakeResponses.submission.insuranceInfo.primary).toMatchObject({subscriberAddressLine1:address.street,subscriberCity:'Washington',subscriberState:'DC',subscriberPostalCode:'20500',subscriberAddressLine2:'Unit9'});expect(wrapper.vm.intakeResponses.submission.insuranceInfo.secondary).toMatchObject({subscriberAddressLine1:'Separate Secondary Street',subscriberCity:'Separate Secondary City'});expect(wrapper.vm.intakeResponses.guardian.guardian_apt).toBe('Apt7');
  expect(m.post.mock.calls.filter(([url])=>url.endsWith('/suggest')).every(([,body])=>body.locale===locale)).toBe(true);
 });
});
it('keeps two independently addressed school children isolated, including a generated schema and apartment',async()=>{
 history.replaceState({},'', '/intake/school-children');const detailFields=[['street','address_street'],['city','address_city'],['state','address_state'],['zip','address_zip'],['apt','address_apt']].map(([name,detailKind])=>({key:`generated_${name}`,detailKind,label:name,type:'text'}));const answers=[{generated_apt:'Unit6'},{generated_street:'Sibling home',generated_city:'Sibling city'}];
 wrapper=mount(SchoolChildDetails,{attachTo:document.body,props:{clients:[{firstName:'One'},{firstName:'Two',sameAddressAsFirst:false}],answers,fields:detailFields,locale:'es','onAnswer':(idx,key,value)=>{answers[idx][key]=value;}},global:{directives:{'address-autocomplete':directive()}}});const first=wrapper.findAll('[data-child-index="0"] input[role=combobox]')[0];await choose(first);expect(answers[0]).toMatchObject({generated_street:address.street,generated_city:'Washington',generated_state:'DC',generated_zip:'20500',generated_apt:'Unit6'});expect(answers[1]).toEqual({generated_street:'Sibling home',generated_city:'Sibling city'});expect(m.post.mock.calls[0][1].locale).toBe('es');
});
it('fills controlled insurance props despite v-model cloning, keeping line2 and another policy unchanged',async()=>{
 const source=ref({insurerName:'Commercial',subscriberAddressLine1:'Old street',subscriberCity:'Old city',subscriberAddressLine2:'Apt2'});
 wrapper=mount(PolicyFields,{attachTo:document.body,props:{modelValue:source.value,scopeKey:'client:100:primary','onUpdate:modelValue':v=>{source.value=v;wrapper.setProps({modelValue:v});}},global:{provide:{intakeLocale:ref('es')},directives:{'address-autocomplete':directive()}}});const street=wrapper.findAll('input').find(x=>x.element.value==='Old street');await choose(street);expect(source.value).toMatchObject({subscriberAddressLine1:address.street,subscriberCity:'Washington',subscriberState:'DC',subscriberPostalCode:'20500',subscriberAddressLine2:'Apt2'});expect(m.post.mock.calls[0][1].locale).toBe('es');
});
