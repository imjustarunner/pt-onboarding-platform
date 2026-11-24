import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:m}));
import Linkage from '../ClientPayerLinkage.vue';
const policy={position:'primary',hasInsurance:true,insurerName:'Example carrier',sourcePayerId:'00050',payerId:'',linked:false,missingFields:['Subscriber date of birth is missing']};
const directory={payerId:'00050',name:'Directory carrier',claims:'yes',eligibility:'yes'};
beforeEach(()=>{
 vi.resetAllMocks();m.get.mockResolvedValue({data:{policies:[policy],coverageVerifiedForClaims:false}});
 m.post.mockImplementation(async url=>({data:url.endsWith('/payer-automation')?{linked:[],unresolved:['primary']}:url.endsWith('/payer-search')?{payers:[directory]}:{linked:true}}));
});
async function openBillingTools(wrapper){await wrapper.get('details.payer-billing-tools').trigger('toggle');await flushPromises();}
it('automates payer matching inline without opening a billing modal or asking import staff to choose',async()=>{
 const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/clients/12/chart-import/payer-automation',{},expect.objectContaining({headers:{'X-Agency-Id':'2'}}));
 expect(wrapper.text()).toContain('Billing review needed for payer matching. You can continue importing.');
 expect(wrapper.find('[role=dialog]').exists()).toBe(false);expect(wrapper.find('input[type=radio]').exists()).toBe(false);
 expect(m.post.mock.calls.some(([url])=>url.endsWith('/payer-search'))).toBe(false);
 wrapper.unmount();
});
it('keeps manual directory tools available to billing without silently selecting search results',async()=>{
 const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();
 wrapper.get('details.payer-billing-tools').element.open=true;await openBillingTools(wrapper);
 expect(wrapper.get('input[type=radio]').element.checked).toBe(false);
 expect(wrapper.findAll('button').find(b=>b.text()==='Verify and link selected payer').attributes('disabled')).toBeDefined();wrapper.unmount();
});
it('confirms only the chosen directory ID and refreshes readiness after manual linking',async()=>{
 const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();
 wrapper.get('details.payer-billing-tools').element.open=true;await openBillingTools(wrapper);await wrapper.get('input[type=radio]').setValue();
 m.get.mockResolvedValue({data:{policies:[{...policy,linked:true,payerId:'00050',directoryName:'Directory carrier'}]}});
 await wrapper.findAll('button').find(b=>b.text()==='Verify and link selected payer').trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/clients/12/chart-import/payer-link',{position:'primary',payerId:'00050',confirmed:true},expect.objectContaining({headers:{'X-Agency-Id':'2'}}));
 expect(wrapper.emitted('ready-change').at(-1)).toEqual([true]);expect(wrapper.text()).toContain('Payer linked');wrapper.unmount();
});
it('does not report ready after directory connection errors',async()=>{
 m.get.mockRejectedValue({response:{status:409,data:{error:{message:'Configure the agency directory'}}}});
 const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();expect(wrapper.text()).toContain('Configure the agency directory');expect(wrapper.emitted('ready-change').flat()).not.toContain(true);wrapper.unmount();
});
it('shows saved agency aliases before directory entries and searches while typing',async()=>{
 vi.useFakeTimers();const original=m.post.getMockImplementation();m.post.mockImplementation(async(url,...args)=>url.endsWith('/payer-search')?{data:{payers:[{payerId:'43324',name:'Kaiser Colorado',directoryName:'Beacon',source:'agency',verified:true},{payerId:'999',name:'Other Kaiser',source:'directory'}]}}:original(url,...args));
 const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();
 wrapper.get('details.payer-billing-tools').element.open=true;await openBillingTools(wrapper);expect(wrapper.text()).toContain('Agency payers');expect(wrapper.text()).toContain('Bills through Beacon');
 await wrapper.get('input:not([type=radio])').setValue('beac');await vi.advanceTimersByTimeAsync(350);await flushPromises();expect(m.post).toHaveBeenCalledWith('/clients/12/chart-import/payer-search',{position:'primary',search:'beac'},expect.anything());wrapper.unmount();vi.useRealTimers();
});
it('refreshes automatic links for both coverages and shows queued verification without claiming active coverage',async()=>{
 const secondary={...policy,position:'secondary'};
 m.get.mockResolvedValueOnce({data:{policies:[policy,secondary]}}).mockResolvedValue({data:{policies:[policy,secondary].map(p=>({...p,linked:true,payerId:'00050'}))}});
 m.post.mockResolvedValue({data:{linked:['primary','secondary'],unresolved:[],automaticEligibility:{status:'queued'}}});
 const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();
 expect(wrapper.emitted('ready-change').at(-1)).toEqual([true]);expect(wrapper.text()).toContain('Automatic eligibility is queued');expect(wrapper.text()).not.toContain('Active coverage reported by payer');wrapper.unmount();
});
it('shows the actual payer coverage response and checked date separately from claims review',async()=>{
 m.get.mockResolvedValue({data:{policies:[{...policy,linked:true}],coverageVerifiedForClaims:true,payerResponses:{primary:{verified:true,checkedAt:'2026-11-24T12:00:00Z'}}}});
 const wrapper=mount(Linkage,{props:{clientId:12,agencyId:2}});await flushPromises();expect(wrapper.text()).toContain('Active coverage reported by payer');expect(wrapper.text()).toContain('Checked');expect(m.post).not.toHaveBeenCalled();wrapper.unmount();
});
