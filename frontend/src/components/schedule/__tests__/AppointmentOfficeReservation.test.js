import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Panel from '../AppointmentOfficeReservation.vue';
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{options:[{id:40,label:'Main office · #10'}],seriesAvailable:true}});api.post.mockResolvedValue({data:{linkedAppointmentIds:[12,13]}});});
it('links a monthly series using the existing appointment IDs and selected reservation',async()=>{
 const wrapper=mount(Panel,{props:{appointmentId:12}});await wrapper.get('button').trigger('click');await flushPromises();
 await wrapper.findAll('select')[1].setValue('series');await wrapper.findAll('button').at(-1).trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/appointments/12/office-reservations/link',{officeEventId:40,scope:'series'},{skipGlobalLoading:true});
 expect(wrapper.text()).toContain('existing session notes and recurring dates are kept');wrapper.unmount();
});
it('shows when no reserved room covers the session instead of making another session',async()=>{
 api.get.mockResolvedValue({data:{options:[]}});const wrapper=mount(Panel,{props:{appointmentId:12}});await wrapper.get('button').trigger('click');await flushPromises();expect(wrapper.text()).toContain('Book the office first');expect(api.post).not.toHaveBeenCalled();wrapper.unmount();
});
