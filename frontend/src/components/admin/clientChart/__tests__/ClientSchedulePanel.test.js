import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),user:{id:10,role:'support'}}));
vi.mock('../../../../services/api',()=>({default:{get:m.get}}));
vi.mock('../../../../store/auth',()=>({useAuthStore:()=>({user:m.user})}));
vi.mock('../../../schedule/ScheduleAvailabilityGrid.vue',()=>({__esModule:true,default:{name:'ScheduleAvailabilityGrid',props:['userId','agencyId','bookingClientId','mode'],template:'<div data-calendar />'}}));
import Panel from '../ClientSchedulePanel.vue';
beforeEach(()=>{vi.resetAllMocks();m.user={id:10,role:'support'};m.get.mockResolvedValue({data:{services:[{is_active:1,provider_user_id:20,provider_name:'First Provider'},{is_active:1,provider_user_id:21,provider_name:'Second Provider'},{is_active:0,provider_user_id:99,provider_name:'Former Provider'}]}});});
it('opens the assigned provider calendar in the chart agency and carries the client into booking',async()=>{
 const w=mount(Panel,{props:{client:{id:12,agency_id:6,full_name:'Synthetic Client'}}});await flushPromises();
 expect(w.findComponent({name:'ScheduleAvailabilityGrid'}).props()).toMatchObject({userId:20,agencyId:6,bookingClientId:12,mode:'admin'});
 expect(w.text()).not.toContain('Former Provider');await w.get('select').setValue(21);await flushPromises();expect(w.findComponent({name:'ScheduleAvailabilityGrid'}).props('userId')).toBe(21);w.unmount();
});
it('keeps a provider’s embedded calendar scoped to their own assignment',async()=>{
 m.user={id:21,role:'provider'};const w=mount(Panel,{props:{client:{id:12,agency_id:6}}});await flushPromises();
 expect(w.findAll('option')).toHaveLength(1);expect(w.findComponent({name:'ScheduleAvailabilityGrid'}).props()).toMatchObject({userId:21,mode:'self'});w.unmount();
});
