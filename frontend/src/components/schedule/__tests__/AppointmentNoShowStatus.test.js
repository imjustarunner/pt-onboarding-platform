import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
import Status from '../AppointmentNoShowStatus.vue';
let wrapper;beforeEach(()=>vi.resetAllMocks());afterEach(()=>wrapper?.unmount());
it('shows the appointment-specific Denver deadline and submits exactly one undo while busy',async()=>{
 api.get.mockResolvedValueOnce({data:{review:{state:'pending',canUndo:true,undoUntil:'2030-01-01T18:10:00Z'}}}).mockResolvedValue({data:{review:{state:'undone',canUndo:false}}});
 let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 wrapper=mount(Status,{props:{appointmentId:90}});await flushPromises();
 expect(wrapper.text()).toContain('11:10:00 AM MST');expect(wrapper.text()).toContain('provider will receive a copy');
 await wrapper.get('button').trigger('click');expect(api.post).not.toHaveBeenCalled();await wrapper.get('textarea').setValue('Client arrived.');await wrapper.get('form').trigger('submit');await wrapper.get('form').trigger('submit');expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/appointments/90/no-show-review/undo',{reason:'Client arrived.'},{skipGlobalLoading:true});
 finish({data:{review:{state:'undone',canUndo:false}}});await flushPromises();expect(wrapper.text()).toContain('No missed-session consequence or notice was applied');expect(wrapper.emitted('undone')).toHaveLength(1);
});
it('clears the previous appointment’s review when switching, including when the new appointment is denied',async()=>{
 api.get.mockResolvedValueOnce({data:{review:{state:'pending',canUndo:true,undoUntil:'2030-01-01T18:10:00Z'}}}).mockRejectedValueOnce({response:{status:403}});
 wrapper=mount(Status,{props:{appointmentId:90}});await flushPromises();expect(wrapper.text()).toContain('Undo no-show');
 await wrapper.setProps({appointmentId:91});await flushPromises();expect(wrapper.find('button').exists()).toBe(false);expect(wrapper.text()).not.toContain('11:10');
});

it('explains the expired deadline without calling it an open correction window',async()=>{api.get.mockResolvedValue({data:{review:{state:'pending',canUndo:false,undoUntil:'2020-01-01T18:10:00Z'}}});wrapper=mount(Status,{props:{appointmentId:90}});await flushPromises();expect(wrapper.text()).toContain('correction window closed');expect(wrapper.text()).toContain('Contact Support to review');expect(wrapper.get('button').attributes('disabled')).toBeDefined();});
