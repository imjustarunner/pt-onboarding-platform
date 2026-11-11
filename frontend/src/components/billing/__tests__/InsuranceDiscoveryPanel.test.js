import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
import InsuranceDiscoveryPanel from '../InsuranceDiscoveryPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const patient={firstName:'Synthetic',lastName:'Person',dateOfBirth:'2000-01-01',addressLine1:'1 Test Street',city:'Testville',state:'CO',postalCode:'80000'};
const data=()=>({enabled:true,patient,fingerprint:'saved-fingerprint',offices:[{id:7,name:'Synthetic office',available:true}],usedThisMonth:0,estimatedPriceCents:150,searches:[]});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:data()});api.post.mockResolvedValue({data:{status:'pending'}});});
const mountPanel=()=>mount(InsuranceDiscoveryPanel,{props:{agencyId:2,clientId:9,serviceDate:'2026-11-10',currentPatient:{...patient}}});
async function open(){const w=mountPanel();await w.find('button').trigger('click');await flushPromises();return w;}
async function confirm(w){for(const input of w.findAll('form input[type=checkbox]').filter(i=>!i.element.parentElement.textContent.includes('fresh paid search')))await input.setValue(true);await w.find('form select').setValue('unknown_insurance');}
it('never searches on mount or viewing history and requires every confirmation',async()=>{
 const w=mountPanel();expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();await w.find('button').trigger('click');await flushPromises();
 const button=w.find('button[type=submit]');expect(button.element.disabled).toBe(true);await confirm(w);expect(button.element.disabled).toBe(false);
 await w.find('form input[type=checkbox]').setValue(false);expect(button.element.disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('submits one confirmed search and prevents duplicate clicks',async()=>{
 const w=await open();await confirm(w);let resolve;api.post.mockImplementationOnce(()=>new Promise(r=>resolve=r));
 await w.find('form').trigger('submit');await w.find('form').trigger('submit');expect(api.post).toHaveBeenCalledOnce();
 expect(api.post.mock.calls[0]).toEqual(['/medical-billing/clients/9/insurance-discovery',expect.objectContaining({agencyId:2,fingerprint:'saved-fingerprint',nameConfirmed:true,birthdateConfirmed:true,addressConfirmed:true,costConfirmed:true,billingOfficeId:7}),{timeout:150000}]);
 resolve({data:{status:'pending'}});await flushPromises();expect(w.find('button[type=submit]').element.disabled).toBe(true);w.unmount();
});
it('invalidates confirmation after identity edits and discards late responses after changing client',async()=>{
 const w=await open();await confirm(w);await w.setProps({currentPatient:{...patient,firstName:'Corrected'}});expect(w.find('button[type=submit]').element.disabled).toBe(true);expect(w.text()).toContain('Client details changed');
 let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>resolve=r));await w.find('button').trigger('click');await w.setProps({clientId:10});resolve({data:data()});await flushPromises();expect(w.find('form').exists()).toBe(false);w.unmount();
});
it('shows monthly usage without a hard cap and explains a missing connection',async()=>{
 api.get.mockResolvedValue({data:{...data(),usedThisMonth:200}});const w=await open();await confirm(w);expect(w.find('button[type=submit]').element.disabled).toBe(false);expect(w.text()).toContain('200 Stedi checks requested');w.unmount();
 api.get.mockResolvedValue({data:{...data(),enabled:false}});const offline=await open();expect(offline.find('form').exists()).toBe(false);expect(offline.text()).toContain('awaiting account setup');offline.unmount();
});
it('retrieves pending results without POST and does not describe zero matches as uninsured',async()=>{
 api.get.mockResolvedValue({data:{...data(),searches:[{id:4,status:'pending',candidates:[]}]}});const w=await open();
 await w.findAll('button').find(b=>b.text().includes('Retrieve this')).trigger('click');await flushPromises();expect(api.get).toHaveBeenCalledWith('/medical-billing/clients/9/insurance-discovery/4',expect.objectContaining({timeout:150000}));expect(api.post).not.toHaveBeenCalled();w.unmount();
 api.get.mockResolvedValue({data:{...data(),searches:[{id:4,status:'complete',candidates:[]}]}});const empty=await open();expect(empty.text()).toContain('does not establish');empty.unmount();
});
