import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
import CoordinationOfBenefitsPanel from '../CoordinationOfBenefitsPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const patient={firstName:'Synthetic',lastName:'Person',dateOfBirth:'2000-01-01',addressLine1:'1 Test Street',city:'Testville',state:'CO',postalCode:'80000'};
const data=()=>({enabled:true,verified:true,patient,fingerprint:'saved-fingerprint',offices:[{id:7,name:'Synthetic office',available:true}],estimatedPriceCents:100,policies:[{slot:'primary',insurerName:'Synthetic Payer',memberId:'ABC-0001',subscriberFirstName:'Synthetic',subscriberLastName:'Person',subscriberDob:'2000-01-01'}],checks:[]});
const payerData={payers:[{stediId:'TESTS',name:'Synthetic Payer',payerId:'00540',states:['CO']}]};
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async path=>({data:path.endsWith('/payers')?payerData:data()}));api.post.mockResolvedValue({data:{status:'complete'}});});
const mountPanel=()=>mount(CoordinationOfBenefitsPanel,{props:{agencyId:2,clientId:9,serviceDate:'2026-11-10',currentInsurance:{patient}}});
const field=(w,label)=>w.findAll('label').find(l=>l.text().startsWith(label)).find('select,input,textarea');
async function open(){const w=mountPanel();await w.find('button').trigger('click');await flushPromises();return w;}
async function confirm(w){await field(w,'Known policy').setValue('primary');await w.findAll('button').find(b=>b.text().includes('participation')).trigger('click');await flushPromises();await field(w,'Participating payer').setValue('TESTS');await field(w,'Billing office').setValue('7');await field(w,'Reason').setValue('billing_order_unclear');for(const c of w.findAll('form input[type=checkbox]').slice(0,6))await c.setValue(true);}
it('never pays on mount, opening history, or looking up payer participation; requires all confirmations',async()=>{
 const w=mountPanel();expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();await w.find('button').trigger('click');await flushPromises();expect(w.find('button[type=submit]').element.disabled).toBe(true);
 await confirm(w);expect(api.post).not.toHaveBeenCalled();expect(w.find('button[type=submit]').element.disabled).toBe(false);await w.find('input[type=checkbox]').setValue(false);expect(w.find('button[type=submit]').element.disabled).toBe(true);w.unmount();
});
it('sends one deliberate request and disables duplicate clicks and stale confirmations',async()=>{
 const w=await open();await confirm(w);let resolve;api.post.mockImplementationOnce(()=>new Promise(r=>resolve=r));await w.find('form').trigger('submit');await w.find('form').trigger('submit');expect(api.post).toHaveBeenCalledOnce();expect(api.post.mock.calls[0]).toEqual(['/medical-billing/clients/9/coordination-of-benefits',expect.objectContaining({agencyId:2,slot:'primary',stediPayerId:'TESTS',fingerprint:'saved-fingerprint',costConfirmed:true,policyConfirmed:true}),{timeout:150000}]);resolve({data:{status:'complete'}});await flushPromises();expect(w.find('button[type=submit]').element.disabled).toBe(true);w.unmount();
});
it('invalidates confirmation when service date or saved insurance is edited',async()=>{
 const w=await open();await confirm(w);await w.find('input[type=date]').setValue('2026-11-09');expect(w.find('button[type=submit]').element.disabled).toBe(true);await confirm(w);await w.setProps({currentInsurance:{patient:{...patient,firstName:'Corrected'}}});expect(w.find('button[type=submit]').element.disabled).toBe(true);expect(w.text()).toContain('Insurance details changed');w.unmount();
});
it('requires an explanation for a deliberate fresh paid request without daily or monthly caps',async()=>{
 const w=await open();await confirm(w);await w.findAll('input[type=checkbox]').at(-1).setValue(true);for(const c of w.findAll('form input[type=checkbox]').slice(0,6))await c.setValue(true);expect(w.find('button[type=submit]').element.disabled).toBe(true);await w.find('textarea').setValue('The payer corrected their records');expect(w.find('button[type=submit]').element.disabled).toBe(false);w.unmount();
});
it('discards late private data after switching client and shows inactive or unverified setup honestly',async()=>{
 const w=mountPanel();let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>resolve=r));await w.find('button').trigger('click');await w.setProps({clientId:10});resolve({data:data()});await flushPromises();expect(w.text()).not.toContain('Synthetic Person');w.unmount();
 api.get.mockResolvedValue({data:{...data(),enabled:false}});const offline=await open();expect(offline.text()).toContain('awaiting account setup');expect(offline.find('form').exists()).toBe(false);offline.unmount();
 api.get.mockResolvedValue({data:{...data(),verified:false}});const unverified=await open();expect(unverified.text()).toContain('Save and verify a known policy');expect(unverified.find('form').exists()).toBe(false);unverified.unmount();
});
it('shows actionable findings and the full response without treating a negative check as no other insurance',async()=>{
 api.get.mockResolvedValue({data:{...data(),checks:[{id:3,status:'complete',reviewRequired:true,serviceDate:'2026-11-10',response:{futureData:'retained'},assessment:{classification:'CobInstanceExistsPrimacyUndetermined',identityMatches:false,issues:['Verify identity with the payer.'],findings:[{index:0,payerName:'Other Payer',memberId:'OTHER',order:'undetermined',dates:{periodStart:'2026-01-01'},serviceTypes:[],serviceTypeCodes:['30'],policy:{payerId:''}}]}}]}});
 const w=await open();expect(w.text()).toContain('billing order is undetermined');expect(w.text()).toContain('Verify identity');expect(w.find('pre').text()).toContain('futureData');expect(w.findAll('button').filter(b=>b.text().startsWith('Copy')).every(b=>b.element.disabled)).toBe(true);expect(w.text()).toContain('negative result does not establish');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
