import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:453}})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{role:'admin'}})}));
import Policies from '../AttendanceFeePolicies.vue';
beforeEach(()=>{vi.resetAllMocks();m.get.mockImplementation(async url=>({data:url.endsWith('cancellation-price-reference')?{providers:[{id:1496,name:'Finley QA'}],references:[{serviceId:320,name:'Math tutoring',businessType:'tutoring',serviceCode:'TUTORING',durationMinutes:60,quotes:{TELEHEALTH:{amountCents:2800}}}]}:{policies:[{id:7,name:'Existing',scopeLevel:'tenant',isActive:true,lateFeeCents:1500,noShowFeeCents:2200}]}}));});
it('compares customer prices with fees and versions the policy without changing the service price',async()=>{
 const wrapper=mount(Policies,{props:{agencyId:453},global:{stubs:{RouterLink:true}}});await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Review / change').trigger('click');await flushPromises();
 expect(wrapper.text()).toContain('$28.00');expect(wrapper.text()).toContain('$15.00');expect(wrapper.text()).toContain('$22.00');
 m.patch.mockResolvedValue({data:{policy:{id:8}}});await wrapper.get('form').trigger('submit');await flushPromises();
 expect(m.patch).toHaveBeenCalledWith('/tenant-booking/agencies/453/cancellation-policies/7',expect.objectContaining({lateFeeCents:1500,noShowFeeCents:2200,noShowSuggestedWaitMinutes:15,noShowUndoAfterEndMinutes:10}));
 expect(m.post).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Existing booked terms are preserved');wrapper.unmount();
});
it('shows a specific error rather than silently accepting a failed save',async()=>{
 const wrapper=mount(Policies,{props:{agencyId:453},global:{stubs:{RouterLink:true}}});await flushPromises();await wrapper.findAll('button').find(b=>b.text()==='Review / change').trigger('click');await flushPromises();
 m.patch.mockRejectedValue({response:{data:{error:{message:'Choose a service belonging to this organization.'}}}});await wrapper.get('form').trigger('submit');await flushPromises();expect(wrapper.get('[role=alert]').text()).toContain('belonging to this organization');expect(wrapper.find('form').exists()).toBe(true);wrapper.unmount();
});
