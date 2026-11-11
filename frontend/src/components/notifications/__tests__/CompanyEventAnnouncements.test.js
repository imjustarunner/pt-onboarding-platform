import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { flushPromises,mount } from '@vue/test-utils';
import CompanyEventAnnouncements from '../CompanyEventAnnouncements.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
let wrapper;
const update={id:90,eventId:8,title:'Anniversary',message:'Invited people: vote for your date.',url:'/company-events/8/staff/token'};
beforeEach(()=>{vi.useFakeTimers();api.get.mockResolvedValue({data:[update]});api.put.mockResolvedValue({data:{}});});
afterEach(()=>{wrapper?.unmount();vi.clearAllMocks();vi.useRealTimers();});
const render=()=>mount(CompanyEventAnnouncements,{props:{userId:4},global:{stubs:{Teleport:true}}});
describe('invited event dashboard announcements',()=>{
 it('renders only the invited endpoint payload and marks the existing notification id read when dismissed',async()=>{wrapper=render();await flushPromises();expect(api.get).toHaveBeenCalledWith('/company-events/announcements/mine',{skipGlobalLoading:true});expect(api.get).toHaveBeenCalledTimes(1);expect(wrapper.find('h2').text()).toBe('Anniversary');expect(wrapper.find('a').attributes('href')).toBe(update.url);await wrapper.find('button[aria-label="Dismiss event update"]').trigger('click');await flushPromises();expect(api.put).toHaveBeenCalledWith('/notifications/90/read');expect(wrapper.find('[role=dialog]').exists()).toBe(false);});
 it('shows no announcement when the scoped endpoint has none or access expires',async()=>{api.get.mockResolvedValueOnce({data:[]});wrapper=render();await flushPromises();expect(wrapper.find('[role=dialog]').exists()).toBe(false);api.get.mockRejectedValueOnce({response:{status:403}});await vi.advanceTimersByTimeAsync(60000);await flushPromises();expect(wrapper.find('[role=dialog]').exists()).toBe(false);expect(api.put).not.toHaveBeenCalled();});
 it('ignores a previous account’s late announcement reply after the user changes',async()=>{let finishOld;api.get.mockReturnValueOnce(new Promise(resolve=>{finishOld=resolve;}));wrapper=render();api.get.mockResolvedValue({data:[]});await wrapper.setProps({userId:5});await flushPromises();finishOld({data:[update]});await flushPromises();expect(wrapper.find('[role=dialog]').exists()).toBe(false);});
});
