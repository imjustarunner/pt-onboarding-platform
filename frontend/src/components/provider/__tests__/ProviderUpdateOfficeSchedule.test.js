import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ProviderUpdateOfficeSchedule from '../ProviderUpdateOfficeSchedule.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {} }) }));
const items = [
  { id: 10, title: 'Denver office', when: 'Monday 1 PM', weekday: 1, hour: 13, timeZone: 'America/Denver' },
  { id: 11, title: 'London office', when: 'Tuesday 2 PM', weekday: 2, hour: 14, timeZone: 'Europe/London' }
];
const button = (wrapper, text) => wrapper.findAll('button').find(b => b.text() === text);
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T01:00:00Z'));
  api.get.mockResolvedValue({ data: { items } });
  api.post.mockResolvedValue({ data: { ok: true } });
});
afterEach(() => vi.useRealTimers());

it('requires confirmation and cancels every listed assignment from its office-local today', async () => {
  const wrapper = mount(ProviderUpdateOfficeSchedule, { props: { agencyId: 6, mode: 'token', token: 'personal' } });
  await flushPromises();
  await button(wrapper, 'Cancel all office reservations — today onward').trigger('click');
  expect(api.post).not.toHaveBeenCalled();
  await button(wrapper, 'Confirm: cancel all from today onward').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(2);
  for (const [index, date] of ['2026-10-03', '2026-10-04'].entries()) {
    expect(api.post).toHaveBeenNthCalledWith(index + 1,
      `/public/provider-update/personal/office-assignments/${items[index].id}/forfeit`,
      { agencyId: 6, scope: 'future', date, acknowledged: true }, { timeout: 30000 });
  }
  expect(wrapper.text()).toContain('Cancelled 2 of 2');
  wrapper.unmount();
});

it('reports blocked assignments and continues cancelling the remaining office hours', async () => {
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'A client appointment is attached.' } } } });
  const wrapper = mount(ProviderUpdateOfficeSchedule, { props: { agencyId: 6 } });
  await flushPromises();
  await button(wrapper, 'Cancel all office reservations — today onward').trigger('click');
  await button(wrapper, 'Confirm: cancel all from today onward').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(wrapper.text()).toContain('Cancelled 1 of 2');
  expect(wrapper.get('[role="alert"]').text()).toContain('Denver office, Monday 1 PM: A client appointment is attached.');
  wrapper.unmount();
});
