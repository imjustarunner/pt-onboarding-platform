import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import Briefing from '../ProviderLoginBriefingModal.vue';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
let wrapper;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => wrapper?.unmount());
async function mount() {
  const pinia = createPinia(); setActivePinia(pinia);
  useAuthStore().user = { id: 7, role: 'provider', firstName: 'Test' };
  const agency = { id: 2, slug: 'itsco', name: 'ITSCO', organization_type: 'agency' };
  const store = useAgencyStore(); store.userAgencies = [agency]; store.agencies = [agency]; store.currentAgency = agency;
  vi.spyOn(store, 'setCurrentAgency').mockImplementation(() => {});
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/dashboard', component: { template: '<div />' } }] });
  await router.push('/dashboard');
  wrapper = shallowMount(Briefing, { props: { loginTrigger: 1 }, global: { plugins: [pinia, router], stubs: { teleport: true } } });
  await flushPromises();
}

it('shows the schedule and Enter Dashboard while unrelated updates are still waiting', async () => {
  api.get.mockImplementation(url => url.endsWith('/schedule-summary')
    ? Promise.resolve({ data: { scheduleEvents: [] } }) : new Promise(() => {}));
  await mount();
  expect(api.get.mock.calls[0][0]).toBe('/users/7/schedule-summary');
  expect(wrapper.text()).toContain('Nothing scheduled on your calendar today.');
  expect(wrapper.text()).toContain('Checking your updates.');
  expect(wrapper.text()).not.toContain('You’re all caught up');
  expect(wrapper.find('.enter-dashboard').attributes('disabled')).toBeUndefined();
  await wrapper.find('.briefing-close').trigger('click');
  expect(wrapper.find('.briefing-overlay').exists()).toBe(false);
});

it('never describes a failed schedule as empty or shows an all-clear after a failed check', async () => {
  api.get.mockRejectedValue(new Error('offline'));
  await mount();
  expect(wrapper.find('dashboard-card-status-stub').attributes('error')).toContain('schedule could not be loaded');
  expect(wrapper.text()).toContain('Some updates could not be checked');
  expect(wrapper.text()).not.toContain('Nothing scheduled');
  expect(wrapper.text()).not.toContain('You’re all caught up');
  expect(wrapper.text()).not.toContain('0On your calendar today');
});
