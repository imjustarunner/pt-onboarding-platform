import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import Splash from '../ProviderUpdateReminderSplash.vue';
const m = vi.hoisted(() => ({ get: vi.fn(), route: null }));
vi.mock('../../../services/api', () => ({ default: { get: m.get } }));
vi.mock('vue-router', () => ({ useRoute: () => m.route }));
const update = { recipientId: 73, agencyName: 'ITSCO', link: 'https://app.itsco.health/provider-update/test-personal-link', progress: { completed: 0, total: 19 } };
beforeEach(() => {
  vi.clearAllMocks();
  m.route = reactive({ path: '/dashboard' });
  m.get.mockResolvedValue({ data: { reminders: [update] } });
});
const render = () => mount(Splash, { props: { loginTrigger: 1 }, global: { stubs: { Teleport: true } } });
it('shows truthful unfinished progress and the recipient link when they log in', async () => {
  const w = render(); await flushPromises();
  expect(w.find('[role=dialog]').exists()).toBe(true);
  expect(w.text()).toContain('0 of 19 sections complete');
  expect(w.text()).toContain('Submit');
  expect(w.get('a').attributes('href')).toBe(update.link);
  expect(m.get.mock.calls[0][0]).toBe('/provider-update/me/reminders');
  w.unmount();
});
it('dismisses for this login and returns on the next login', async () => {
  const w = render(); await flushPromises();
  await w.get('button[aria-label]').trigger('click');
  expect(w.find('[role=dialog]').exists()).toBe(false);
  await w.setProps({ loginTrigger: 2 }); await flushPromises();
  expect(w.find('[role=dialog]').exists()).toBe(true);
  w.unmount();
});
it('does not interrupt someone already working inside their update', async () => {
  m.route.path = '/provider-update/their-token';
  const w = render(); await flushPromises();
  expect(w.find('[role=dialog]').exists()).toBe(false);
  m.get.mockResolvedValue({ data: { reminders: [] } });
  m.route.path = '/dashboard'; await flushPromises();
  expect(w.find('[role=dialog]').exists()).toBe(false);
  w.unmount();
});
it('does not show the splash for completed or removed recipients', async () => {
  m.get.mockResolvedValue({ data: { reminders: [] } });
  const w = render(); await flushPromises();
  expect(w.find('[role=dialog]').exists()).toBe(false);
  w.unmount();
});
it('distinguishes reviewed sections from the final submission', async () => {
  m.get.mockResolvedValue({ data: { reminders: [{ ...update, progress: { completed: 19, total: 19 } }] } });
  const w = render(); await flushPromises();
  expect(w.text()).toContain('Your final submission is still needed');
  w.unmount();
});
