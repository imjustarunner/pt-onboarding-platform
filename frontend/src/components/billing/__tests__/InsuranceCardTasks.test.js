import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import InsuranceCardTasks from '../InsuranceCardTasks.vue';
import GuardianBillingNeeds from '../GuardianBillingNeeds.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
const task=()=>({profileId:5,cycle:'synthetic-cycle',clients:[{id:101,name:'Synthetic Child'}],state:'missing',emailEnabled:true,missingSlots:['primary_back'],slots:{primary_front:{required:true,received:true},primary_back:{required:true,received:false}}});
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{tasks:[task()]}});api.post.mockResolvedValue({data:{uploaded:true}});});
it('shows each side and uploads a chosen side to the authenticated profile scope',async()=>{
 const w=mount(InsuranceCardTasks,{props:{agencyId:1,clientId:101}});await flushPromises();expect(w.text()).toContain('Primary card · front');expect(w.text()).toContain('Primary card · back');expect(w.text()).toContain('Missing');
 const input=w.findAll('input[type=file]')[1];Object.defineProperty(input.element,'files',{value:[new File(['%PDF-fixture'],'synthetic.pdf',{type:'application/pdf'})]});await input.trigger('change');await flushPromises();const [path,form,options]=api.post.mock.calls[0];expect(path).toBe('/family-billing/insurance-cards/5/upload');expect(form.get('slot')).toBe('primary_back');expect(form.get('cycle')).toBe('synthetic-cycle');expect(options.params.agencyId).toBe(1);expect(w.text()).toContain('uploaded securely');w.unmount();
});
it('clears old patient details and discards late replies after switching practices',async()=>{
 let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValueOnce({data:{tasks:[]}});const w=mount(InsuranceCardTasks,{props:{agencyId:1}});await w.setProps({agencyId:2});await flushPromises();resolve({data:{tasks:[task()]}});await flushPromises();expect(w.text()).not.toContain('Synthetic Child');w.unmount();
});
it('help requests and opt-out updates are scoped to the current profile version',async()=>{
 const w=mount(InsuranceCardTasks,{props:{agencyId:1}});await flushPromises();await w.findAll('button').find(b=>b.text().includes('I need help')).trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/family-billing/insurance-cards/5/action',expect.objectContaining({agencyId:1,cycle:'synthetic-cycle',action:'help'}));await w.find('input[type=checkbox]').setValue(false);await flushPromises();expect(api.post).toHaveBeenLastCalledWith('/family-billing/insurance-cards/5/action',expect.objectContaining({action:'email_preference',enabled:false}));w.unmount();
});
it('surfaces a guardian’s balance, split acceptance and card task directly on home',async()=>{
 api.get.mockResolvedValue({data:{dueCents:4000,pendingPayments:0,splitRequests:1,paymentTasks:[],insuranceCards:[{state:'missing'}]}});const w=mount(GuardianBillingNeeds,{props:{agencyId:1,clientId:101},global:{stubs:{RouterLink:true}}});await flushPromises();expect(w.text()).toContain('$40.00');expect(w.text()).toContain('shared payment request');expect(w.text()).toContain('Insurance card upload');await w.findAll('button')[2].trigger('click');expect(w.emitted('navigate')).toEqual([['payment_methods']]);w.unmount();
});
