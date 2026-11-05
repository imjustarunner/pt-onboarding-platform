import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import TenantAdminDashboard from '../TenantAdminDashboard.vue';
import api from '../../../services/api';

const mocks = vi.hoisted(() => ({ notifications: vi.fn(), counts: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'OrganizationAdminDashboard', params: { organizationSlug: 'itsco' }, query: {}, path: '/itsco/admin' }),
  useRouter: () => ({ push: vi.fn() })
}));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({
  currentAgency: { id: 2, slug: 'itsco', name: 'ITSCO', organization_type: 'agency' }, userAgencies: []
}) }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => ({
  platformBranding: {}, getAdminQuickActionIconUrl: () => null, getDashboardCardIconUrl: () => null,
  getDashboardIconOverrideUrl: () => null
}) }));
vi.mock('../../../store/notifications', () => ({ useNotificationStore: () => ({
  notifications: [], unreadCount: 0, fetchNotifications: mocks.notifications, fetchCounts: vi.fn().mockResolvedValue()
}) }));
vi.mock('../../../store/communicationsCounts', () => ({ useCommunicationsCountsStore: () => ({
  unreadMessagesCount: 0, fetchCounts: mocks.counts
}) }));

let wrapper;
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ frequencies: {} }) }));
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('opens the schedule and clears loading while background badges and derived counts are still pending', async () => {
  const background = new Promise(() => {});
  mocks.notifications.mockReturnValue(background);
  mocks.counts.mockReturnValue(background);
  api.get.mockImplementation(url => url === '/payroll/periods/unpaid-drafts-report'
    ? background : Promise.resolve({ data: url === '/dashboard/schedule-snapshot' ? { sessions: [] } : {} }));
  wrapper = shallowMount(TenantAdminDashboard, {
    global: { plugins: [createPinia()], stubs: { RouterLink: true } }
  });
  await flushPromises();
  await vi.advanceTimersByTimeAsync(500);
  await flushPromises();
  expect(api.get.mock.calls.some(([url]) => url === '/dashboard/schedule-snapshot')).toBe(true);
  expect(wrapper.findComponent({ name: 'OpsSummaryCards' }).props('scheduleLoading')).toBe(false);
  expect(wrapper.find('.loading-chip').exists()).toBe(false);
  expect(mocks.notifications).toHaveBeenCalledOnce();
  expect(mocks.counts).toHaveBeenCalledOnce();
});
