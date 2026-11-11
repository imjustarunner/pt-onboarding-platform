import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import Tracker from '../SchoolWeekdayResponseTracker.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const response={counts:{pending:1,opened:1,completed:1},providers:[
 {providerId:1,name:'Alex Pending',status:'pending',accounted:1,invitationStatus:'sent',smsStatus:'waiting',smsDueAt:'2026-11-12T17:00:00Z',thankyouStatus:'waiting'},
 {providerId:2,name:'Blair Opened',status:'opened',accounted:3,openedAt:'2026-11-11T17:00:00Z',invitationStatus:'sent',smsStatus:'waiting',thankyouStatus:'waiting'},
 {providerId:3,name:'Casey Completed',status:'completed',accounted:5,completedAt:'2026-11-11T17:05:00Z',invitationStatus:'sent',smsStatus:'cancelled',thankyouStatus:'sent'}]};
let wrapper;
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:structuredClone(response)});});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
async function render(){wrapper=mount(Tracker,{props:{agencyId:2}});await flushPromises();return wrapper;}
it('shows separate unopened, opened and complete statuses with all-five completion evidence',async()=>{
 await render();expect(wrapper.findAll('tbody tr')).toHaveLength(3);expect(wrapper.text()).toContain('5 / 5');
 await wrapper.findAll('.response-counts button')[1].trigger('click');expect(wrapper.findAll('tbody tr')).toHaveLength(1);expect(wrapper.find('tbody').text()).toContain('Blair Opened');
 await wrapper.find('select').setValue('unfinished');expect(wrapper.findAll('tbody tr')).toHaveLength(2);
 await wrapper.find('input').setValue('alex');expect(wrapper.findAll('tbody tr')).toHaveLength(1);expect(wrapper.find('tbody').text()).toContain('After');
});
it('refreshes automatically while open and keeps failures visible without fabricating responses',async()=>{
 vi.useFakeTimers();await render();api.get.mockRejectedValueOnce(new Error('offline'));
 await vi.advanceTimersByTimeAsync(30000);await flushPromises();expect(api.get).toHaveBeenCalledTimes(2);expect(wrapper.find('[role=alert]').text()).toContain('Could not refresh');expect(wrapper.findAll('tbody tr')).toHaveLength(3);
});
it('drops stale responses when Rachel switches agencies',async()=>{
 await render();let stale;api.get.mockImplementationOnce(()=>new Promise(resolve=>{stale=resolve;}));await wrapper.setProps({agencyId:6});
 api.get.mockResolvedValueOnce({data:{counts:{pending:0,opened:0,completed:0},providers:[]}});await wrapper.setProps({agencyId:377});await flushPromises();stale({data:response});await flushPromises();expect(wrapper.findAll('tbody tr')).toHaveLength(0);
});
