import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import KioskOfficeBoard from '../KioskOfficeBoard.vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
import api from '../../../services/api';
const data = { timezone:'America/Denver',date:'2026-09-29',time:'10:30',rooms:[{id:1,roomNumber:1,name:'Counseling',occupied:true,current:[],assignments:[]}] };
let wrapper;
afterEach(() => {wrapper?.unmount();vi.clearAllMocks();});
describe('office board navigation', () => {
 it('keeps a room open when moving to the next day and sends wall time to the API', async () => {
  api.get.mockResolvedValue({data}); wrapper=mount(KioskOfficeBoard,{props:{locationId:1}});await flushPromises();
  expect(wrapper.find('.room-card.occupied').exists()).toBe(true);
  await wrapper.get('.room-card').trigger('click');expect(wrapper.get('#room-details').text()).toContain('Office 1');
  api.get.mockResolvedValue({data:{...data,date:'2026-09-30',rooms:[{...data.rooms[0],occupied:false}]}});
  await wrapper.get('[aria-label="Next day"]').trigger('click');await flushPromises();
  expect(api.get).toHaveBeenLastCalledWith('/kiosk/1/office-directory',{params:{date:'2026-09-30',time:'10:30'}});
  expect(wrapper.get('#room-details').text()).toContain('Office 1'); expect(wrapper.find('.room-card.occupied').exists()).toBe(false);
 });
 it('ignores late responses and clears stale colors when requests fail', async () => {
  let resolve;api.get.mockResolvedValueOnce({data});wrapper=mount(KioskOfficeBoard,{props:{locationId:1}});await flushPromises();
  api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await wrapper.get('[aria-label="Next day"]').trigger('click');
  api.get.mockRejectedValueOnce(new Error('offline'));await wrapper.get('.now-button').trigger('click');await flushPromises();
  resolve({data});await flushPromises();
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);expect(wrapper.find('.room-card').exists()).toBe(false);
 });
});
