import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi} from 'vitest';
vi.mock('vue-router',()=>({useRoute:()=>({query:{},params:{}}),useRouter:()=>({replace:vi.fn(async()=>{}),push:vi.fn()})}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>({user:{id:1,role:'super_admin'}})}));
vi.mock('../../store/agency',()=>({useAgencyStore:()=>({agencies:[{id:2,name:'Agency'}],currentAgency:{id:2},setCurrentAgency:vi.fn()})}));
vi.mock('../../services/api',()=>({default:{get:vi.fn(async url=>({data:url.endsWith('pending-queue-summary')?{booking:2}:url.endsWith('coverage-flags')?{count:0}:[]}))}}));
import View from '../admin/OfficeApprovalsView.vue';
it('makes Provider Update requests reachable even when the older intake queue is empty',async()=>{
 const w=mount(View,{global:{stubs:{RouterLink:true,OfficeCoverageFlagsView:true,OfficeScheduleApprovalsView:{template:'<div data-test="booking-queue">Booking requests</div>'}}}});
 await flushPromises();expect(w.text()).toContain('Calendar / Provider Update requests');
 const button=w.findAll('button').find(b=>b.text()==='Review 2 calendar requests');expect(button).toBeTruthy();
 await button.trigger('click');await flushPromises();expect(w.find('[data-test="booking-queue"]').exists()).toBe(true);w.unmount();
});
