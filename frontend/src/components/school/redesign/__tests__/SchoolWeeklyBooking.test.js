import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../../services/api';
import SchoolWeeklyBooking from '../SchoolWeeklyBooking.vue';
const context={enabled:true,today:'2026-10-30',timeZone:'America/Denver',slots:[{id:10,client_id:11,initials:'AB',start_time:'08:30:00',end_time:'09:15:00'}],services:[{id:8,serviceCode:'90834',name:'Individual'}]};
async function setup() {
 const wrapper=mount(SchoolWeeklyBooking,{props:{schoolOrganizationId:451,providerUserId:1433,weekday:'Monday'}});
 await flushPromises();
 const selects=wrapper.findAll('select');
 await selects[0].setValue('10');await selects[1].setValue('8');
 return wrapper;
}
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:context});api.post.mockResolvedValue({data:{appointments:[{id:1},{id:2}]}});});
describe('school weekly booking',()=>{
 it('creates weekly calendar appointments from a saved slot and prevents an immediate duplicate submit',async()=>{
  const wrapper=await setup();
  expect(wrapper.text()).toContain('planning times stay the same');
  await wrapper.find('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/school-portal/451/days/Monday/providers/1433/weekly-booking',expect.objectContaining({slotId:10,tenantServiceId:8,startMode:'next_week',occurrenceCount:8,acknowledgeSameDayServices:false}));
  expect(wrapper.text()).toContain('2 weekly appointments booked');
  await wrapper.find('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(1);
 });
 it('lets the provider choose a date and review same-day service warnings explicitly',async()=>{
  api.post.mockRejectedValueOnce({response:{data:{error:{code:'SAME_DAY_SERVICE_WARNING',message:'Review another service on this day.'}}}});
  const wrapper=await setup();
  await wrapper.findAll('select')[2].setValue('date');
  await wrapper.find('input[type="date"]').setValue('2026-11-04');
  await wrapper.find('form').trigger('submit');await flushPromises();
  expect(wrapper.text()).toContain('Review another service');
  expect(api.post).toHaveBeenCalledTimes(1);
  await wrapper.findAll('button').find(button=>button.text().includes('I reviewed')).trigger('click');await flushPromises();
  expect(api.post.mock.calls[1][1]).toMatchObject({startMode:'date',startDate:'2026-11-04',acknowledgeSameDayServices:true});
 });
 it('does not hide a partial booking behind a retry button',async()=>{
  api.post.mockRejectedValue({response:{data:{error:{message:'A conflicting appointment exists.'},createdAppointmentIds:[81,82]}}});
  const wrapper=await setup();await wrapper.find('form').trigger('submit');await flushPromises();
  expect(wrapper.text()).toContain('Some appointments were saved (81, 82)');
  expect(wrapper.find('button.btn-primary').attributes('disabled')).toBeDefined();
 });
 it('shows rollout or school-location setup requirements instead of offering booking',async()=>{
  api.get.mockResolvedValue({data:{enabled:false,reason:'Connect the school service location.'}});
  const wrapper=mount(SchoolWeeklyBooking,{props:{schoolOrganizationId:451,providerUserId:1433,weekday:'Monday'}});await flushPromises();
  expect(wrapper.text()).toContain('Connect the school service location.');
  expect(wrapper.find('form').exists()).toBe(false);
 });
});
