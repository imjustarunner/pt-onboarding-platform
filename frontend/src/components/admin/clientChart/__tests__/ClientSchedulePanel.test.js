import {beforeEach,expect,it,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),user:{id:10,role:'support'}}));
vi.mock('../../../../services/api',()=>({default:{get:m.get}}));
vi.mock('../../../../store/auth',()=>({useAuthStore:()=>({user:m.user})}));
import Panel from '../ClientSchedulePanel.vue';
const calendar={name:'ClientCalendarStub',props:['userId','agencyId','bookingClientId','mode'],template:'<div data-calendar />'};
const openPanel=client=>shallowMount(Panel,{props:{client},global:{stubs:{ScheduleAvailabilityGrid:calendar}}});
beforeEach(()=>{vi.resetAllMocks();m.user={id:10,role:'support'};m.get.mockResolvedValue({data:{services:[{is_active:1,provider_user_id:20,provider_name:'First Provider'},{is_active:1,provider_user_id:21,provider_name:'Second Provider'},{is_active:0,provider_user_id:99,provider_name:'Former Provider'}]}});});
it('opens the assigned provider calendar in the chart agency and carries the client into booking',async()=>{
 const w=openPanel({id:12,agency_id:6,full_name:'Synthetic Client'});await flushPromises();
 expect(w.findComponent(calendar).props()).toMatchObject({userId:20,agencyId:6,bookingClientId:12,mode:'admin'});
 expect(w.text()).not.toContain('Former Provider');await w.get('select').setValue(21);await flushPromises();expect(w.findComponent(calendar).props('userId')).toBe(21);w.unmount();
});
it('keeps a provider’s embedded calendar scoped to their own assignment',async()=>{
 m.user={id:21,role:'provider'};const w=openPanel({id:12,agency_id:6});await flushPromises();
 expect(w.findAll('option')).toHaveLength(1);expect(w.findComponent(calendar).props()).toMatchObject({userId:21,mode:'self'});w.unmount();
});
