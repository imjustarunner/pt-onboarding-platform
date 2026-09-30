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
 it('advances to the next whole hour, preserves the range, and offers Clear selection',async()=>{
  api.get.mockImplementation(async (_url,config)=>({data:{...data,...config.params}}));wrapper=mount(KioskOfficeBoard,{props:{locationId:1}});await flushPromises();
  await wrapper.get('[aria-label="Office end time"]').setValue('18:00');await flushPromises();
  expect(api.get).toHaveBeenLastCalledWith('/kiosk/1/office-directory',{params:{date:'2026-09-29',time:'10:30',endTime:'18:00'}});
  expect(wrapper.find('.minute-shortcuts').exists()).toBe(false);await wrapper.findAll('button').find(b=>b.text()==='Next hour').trigger('click');expect(api.get).toHaveBeenLastCalledWith('/kiosk/1/office-directory',{params:{date:'2026-09-29',time:'11:00',endTime:'18:30'}});
  await flushPromises();await wrapper.get('.room-card').trigger('click');await wrapper.findAll('button').find(b=>b.text()==='Clear room selection').trigger('click');expect(wrapper.find('#room-details').exists()).toBe(false);
 });
 it('does not paint old or incomplete API responses as available', async () => {
  api.get.mockResolvedValue({data:{rooms:[{id:1,roomNumber:1,assignments:[]}]}});
  wrapper=mount(KioskOfficeBoard,{props:{locationId:1}});await flushPromises();
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);expect(wrapper.find('.room-card').exists()).toBe(false);
 });
 it('ignores late responses and clears stale colors when requests fail', async () => {
  let resolve;api.get.mockResolvedValueOnce({data});wrapper=mount(KioskOfficeBoard,{props:{locationId:1}});await flushPromises();
  api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await wrapper.get('[aria-label="Next day"]').trigger('click');
  api.get.mockRejectedValueOnce(new Error('offline'));await wrapper.get('.now-button').trigger('click');await flushPromises();
  resolve({data});await flushPromises();
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);expect(wrapper.find('.room-card').exists()).toBe(false);
 });
});

it('Next hour rolls the directory date forward at midnight',async()=>{
 api.get.mockImplementation(async (_url,config)=>({data:{...data,date:'2026-09-30',time:'23:45',...config.params}}));wrapper=mount(KioskOfficeBoard,{props:{locationId:1}});await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Next hour').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenLastCalledWith('/kiosk/1/office-directory',{params:{date:'2026-10-01',time:'00:00'}});
});
