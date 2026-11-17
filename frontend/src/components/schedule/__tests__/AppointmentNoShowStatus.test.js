import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
import Status from '../AppointmentNoShowStatus.vue';
let wrapper;beforeEach(()=>vi.resetAllMocks());afterEach(()=>wrapper?.unmount());
it('shows the appointment-specific Denver deadline and submits exactly one undo while busy',async()=>{
 api.get.mockResolvedValue({data:{review:{state:'pending',canUndo:true,undoUntil:'2030-01-01T18:10:00Z'}}});
 let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 wrapper=mount(Status,{props:{appointmentId:90}});await flushPromises();
 expect(wrapper.text()).toContain('11:10:00 AM MST');expect(wrapper.text()).toContain('provider will receive a copy');
 await wrapper.get('button').trigger('click');await wrapper.get('button').trigger('click');expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/appointments/90/no-show-review/undo',{});
 finish({data:{review:{state:'undone',canUndo:false}}});await flushPromises();expect(wrapper.text()).toContain('No missed-session consequence or notice was applied');expect(wrapper.emitted('undone')).toHaveLength(1);
});
it('clears the previous appointment’s review when switching, including when the new appointment is denied',async()=>{
 api.get.mockResolvedValueOnce({data:{review:{state:'pending',canUndo:true,undoUntil:'2030-01-01T18:10:00Z'}}}).mockRejectedValueOnce({response:{status:403}});
 wrapper=mount(Status,{props:{appointmentId:90}});await flushPromises();expect(wrapper.text()).toContain('Undo no-show');
 await wrapper.setProps({appointmentId:91});await flushPromises();expect(wrapper.find('button').exists()).toBe(false);expect(wrapper.text()).not.toContain('11:10');
});
