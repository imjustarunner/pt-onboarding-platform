import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:m}));
import Linkage from '../ClientPayerLinkage.vue';
const policy={position:'primary',hasInsurance:true,insurerName:'Example carrier',sourcePayerId:'00050',payerId:'',linked:false,missingFields:['Subscriber date of birth is missing']};
beforeEach(()=>{vi.resetAllMocks();m.get.mockResolvedValue({data:{policies:[policy],coverageVerifiedForClaims:false}});});
it('shows unresolved linkage separately from eligibility and never selects a search result automatically',async()=>{
 m.post.mockResolvedValue({data:{payers:[{payerId:'00050',name:'Directory carrier',claims:'yes',eligibility:'yes'}]}});
 const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();expect(wrapper.text()).toContain('Payer needs verification and linking');expect(wrapper.text()).toContain('Member eligibility and claim verification still require billing review');
 await wrapper.findAll('button').find(b=>b.text()==='Search payer directory').trigger('click');await flushPromises();expect(wrapper.get('input[type=radio]').element.checked).toBe(false);expect(wrapper.findAll('button').find(b=>b.text()==='Confirm match and link payer').attributes('disabled')).toBeDefined();wrapper.unmount();
});
it('confirms only the chosen directory ID and refreshes readiness after linking',async()=>{
 m.post.mockResolvedValueOnce({data:{payers:[{payerId:'00050',name:'Directory carrier'}]}}).mockResolvedValueOnce({data:{linked:true}});
 const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();await wrapper.findAll('button').find(b=>b.text()==='Search payer directory').trigger('click');await flushPromises();await wrapper.get('input[type=radio]').setValue();
 m.get.mockResolvedValue({data:{policies:[{...policy,linked:true,payerId:'00050',directoryName:'Directory carrier'}]}});
 await wrapper.findAll('button').find(b=>b.text()==='Confirm match and link payer').trigger('click');await flushPromises();
 expect(m.post).toHaveBeenLastCalledWith('/clients/12/chart-import/payer-link',{position:'primary',payerId:'00050',confirmed:true},expect.objectContaining({headers:{'X-Agency-Id':'2'}}));expect(wrapper.emitted('ready-change').at(-1)).toEqual([true]);expect(wrapper.text()).toContain('Payer linked');wrapper.unmount();
});
it('does not report ready after directory connection errors',async()=>{
 m.get.mockRejectedValue({response:{status:409,data:{error:{message:'Configure the agency directory'}}}});const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();expect(wrapper.text()).toContain('Configure the agency directory');expect(wrapper.emitted('ready-change').flat()).not.toContain(true);wrapper.unmount();
});
