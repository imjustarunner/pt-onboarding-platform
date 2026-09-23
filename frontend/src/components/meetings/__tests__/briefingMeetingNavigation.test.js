import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PrivilegedLoginBriefingModal from '../../admin/PrivilegedLoginBriefingModal.vue';
import ProviderLoginBriefingModal from '../../provider/ProviderLoginBriefingModal.vue';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  auth: { user: { id: 1, role: 'super_admin', firstName: 'Test' } },
  agency: { currentAgency: { id: 2, name: 'Test agency' }, agencies: [] }
}));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mocks.agency }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => ({ platformBranding: {} }) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T12:30:00Z'));
  mocks.get.mockResolvedValue({ data: { scheduleEvents: [{
    kind: 'TEAM_MEETING', id: 'weekly', title: 'Weekly Check-in',
    startAt: '2026-09-24T00:30:00Z', endAt: '2026-09-24T01:30:00Z',
    appJoinUrl: '/join/weekly-check-in'
  }] } });
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

async function fixture(component, prefix = '') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/:organizationSlug?/dashboard', component: { template: '<div>Dashboard</div>' } },
    { path: '/:organizationSlug?/my-schedule', component: { template: '<div>Schedule</div>' } }
  ] });
  await router.push(`${prefix}/dashboard`);
  await router.isReady();
  const wrapper = mount(component, { global: { plugins: [router], stubs: { Teleport: true } } });
  // Open the real briefing without invoking unrelated briefing-data requests.
  wrapper.vm.visible = true;
  await nextTick();
  await flushPromises();
  expect(mocks.get).toHaveBeenCalled();
  return { wrapper, router };
}

describe.each([
  ['admin', PrivilegedLoginBriefingModal],
  ['provider', ProviderLoginBriefingModal]
])('%s welcome meeting navigation', (_, component) => {
  it.each(['', '/itsco'])('dismisses the overlay and routes to the selected meeting (%s)', async (prefix) => {
    const { wrapper, router } = await fixture(component, prefix);
    try {
      expect(wrapper.find('.briefing-close').exists()).toBe(true);
      await wrapper.get('.dashboard-meetings a').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe(`${prefix}/my-schedule`);
      expect(router.currentRoute.value.query).toMatchObject({ eventId: 'weekly', eventKind: 'TEAM_MEETING' });
      expect(wrapper.find('.briefing-close').exists()).toBe(false);

      // Reopening on an already-selected route must also dismiss: a route-only
      // watcher would miss this because RouterLink treats it as duplicate navigation.
      wrapper.vm.visible = true;
      await nextTick();
      await flushPromises();
      await wrapper.get('.dashboard-meetings a').trigger('click');
      await flushPromises();
      expect(wrapper.find('.briefing-close').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('keeps the current briefing open for an open-in-new-tab click', async () => {
    const { wrapper, router } = await fixture(component);
    try {
      await wrapper.get('.dashboard-meetings a').trigger('click', { ctrlKey: true });
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/dashboard');
      expect(wrapper.find('.briefing-close').exists()).toBe(true);
    } finally { wrapper.unmount(); }
  });

  it('dismisses the briefing when entering a joinable meeting', async () => {
    vi.setSystemTime(new Date('2026-09-24T00:31:00Z'));
    const { wrapper } = await fixture(component);
    try {
      const link = wrapper.get('.meeting-join');
      expect(link.attributes('href')).toBe('/join/weekly-check-in');
      // Prevent jsdom's page navigation; the component still receives the click.
      link.element.addEventListener('click', event => event.preventDefault());
      await link.trigger('click');
      expect(wrapper.find('.briefing-close').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
});
