import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import OfficeSchedulingTransition from '../OfficeSchedulingTransition.vue';
import OfficeAssignmentUsageReviews from '../OfficeAssignmentUsageReviews.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks(); api.put.mockResolvedValue({ data: { ok: true } }); api.post.mockResolvedValue({ data: { ok: true } });
});
it('shows a preview and requires confirmation before saving an agency transition', async () => {
  api.get.mockImplementation(async url => ({ data: url.endsWith('/preview')
    ? { assignmentCount: 10, missingAgencyCount: 0, protectedAppointmentCount: 2 }
    : { items: url.endsWith('scheduling-policies') ? [{ agencyId: 2, name: 'Test Agency', transitionDate: null }] : [] } }));
  const wrapper = mount(OfficeSchedulingTransition); await flushPromises();
  await wrapper.get('select').setValue(2); await wrapper.get('input[type=date]').setValue('2027-01-04');
  expect(api.put).not.toHaveBeenCalled();
  await wrapper.findAll('button').find(b => b.text() === 'Preview transition').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('10 recurring hourly assignments');
  expect(api.put).not.toHaveBeenCalled();
  await wrapper.findAll('button').find(b => b.text() === 'Confirm scheduling policy').trigger('click'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/office-schedule/scheduling-policies/2', { transitionDate: '2027-01-04', confirmed: true });
  wrapper.unmount();
});
it('lets a provider re-request in one click, then shows pending protection', async () => {
  const row = { id: 10, status: 'action_required', deadlineDate: '2026-10-06', timezone: 'America/Denver', officeName: 'Main', roomName: 'Room 1', weekday: 1, hour: 14 };
  api.get.mockResolvedValueOnce({ data: { items: [row] } }).mockResolvedValue({ data: { items: [{ ...row, status: 'pending' }] } });
  const wrapper = mount(OfficeAssignmentUsageReviews); await flushPromises();
  expect(wrapper.text()).toContain('2026-10-06 (America/Denver)');
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/office-schedule/usage-reviews/10/request');
  expect(wrapper.text()).toContain('protected while approval is pending');
  expect(wrapper.find('button').exists()).toBe(false);
  wrapper.unmount();
});
it('explains protected interior hours without offering an unnecessary re-request', async () => {
 api.get.mockResolvedValue({data:{items:[{id:15,status:'protected_interior',officeName:'Main',roomName:'Room 1',weekday:1,hour:15}]}});
 const wrapper=mount(OfficeAssignmentUsageReviews); await flushPromises();
 expect(wrapper.text()).toContain('Protected interior hour');
 expect(wrapper.text()).toContain('No re-request is needed');
 expect(wrapper.find('button').exists()).toBe(false);
 wrapper.unmount();
});
