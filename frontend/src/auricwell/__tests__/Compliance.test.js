import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { canManageComplianceReports } from '../workspace';
import { fullSuiteDestination } from '../sharedWorkspace';
const state = vi.hoisted(() => ({ get: vi.fn(), auth: { user: null } }));
vi.mock('../../services/api', () => ({ default: { get: state.get } }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => state.auth }));
const agency = reactive({ currentAgency: null });
vi.mock('../../store/agency', () => ({ useAgencyStore: () => agency }));
vi.mock('../Chart.vue', () => ({ default: { template: '<div>Chart</div>' } }));
vi.mock('../Clients.vue', () => ({ default: { template: '<div>Clients</div>' } }));
vi.mock('../ScheduleWorkspace.vue', () => ({ default: { template: '<div>Schedule</div>' } }));
vi.mock('../Overview.vue', () => ({ default: { template: '<div>Overview</div>' } }));
vi.mock('../Portal.vue', () => ({ default: { template: '<div>Portal</div>' } }));
vi.mock('../Records.vue', () => ({ default: { template: '<div>Records</div>' } }));
vi.mock('../WorkspaceTools.vue', () => ({ default: { template: '<div>Tools</div>' } }));
vi.mock('../SessionRecovery.vue', () => ({ default: { template: '<div>Locked</div>' } }));
vi.mock('../../components/WorkspaceNavigation.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../components/notifications/AnnouncementToasts.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../components/admin/ToastAnnouncementManager.vue', () => ({ default: { template: '<div />' } }));
import App from '../App.vue';
let wrapper, router;
const context = role => ({ actor: { id: 990001, role, first_name: 'Synthetic', last_name: 'Administrator' }, practice: { id: 990002, name: 'Synthetic Practice', slug: 'synthetic' } });
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  state.get.mockResolvedValue({ data: { items: [], unreadCount: 0, preferences: {} } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => context('super_admin') })));
});
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.unstubAllGlobals(); });
async function open(role = 'super_admin', section = 'overview') {
  fetch.mockResolvedValue({ ok: true, json: async () => context(role) });
  router = createRouter({ history: createMemoryHistory('/app'), routes: [{ path: '/:organizationSlug/:section?', component: { template: '<div />' } }] });
  await router.push(`/synthetic/${section}`); await router.isReady();
  wrapper = mount(App, { global: { plugins: [router], stubs: { NarrivaComplianceReportsView: { template: '<div data-test="compliance-page">Compliance reports</div>' } } } });
  await flushPromises();
}
it('opens the shared report page from the Auricwell Compliance tab without leaving the practice', async () => {
  await open();
  const tab = wrapper.get('a[href="/app/synthetic/compliance"]'); expect(tab.text()).toBe('Compliance');
  await tab.trigger('click'); await flushPromises();
  expect(router.currentRoute.value.params.section).toBe('compliance');
  expect(wrapper.get('[data-test="compliance-page"]').text()).toBe('Compliance reports');
  expect(wrapper.get('a[href="/app/synthetic/compliance"]').attributes('aria-current')).toBe('page');
  expect(agency.currentAgency.id).toBe(990002);
});
it('hides reports from providers and blocks a direct Compliance URL before loading report data', async () => {
  await open('provider', 'compliance');
  expect(wrapper.find('a[href="/app/synthetic/compliance"]').exists()).toBe(false);
  expect(wrapper.find('[data-test="compliance-page"]').exists()).toBe(false);
  expect(wrapper.text()).toContain('authorized agency administrator');
  expect(state.get.mock.calls.some(([url]) => url.includes('/compliance-reports/'))).toBe(false);
});
it('limits report navigation to real administrative roles and retains the shared schedule return path', () => {
  for (const role of ['admin', 'agency_admin', 'super_admin']) expect(canManageComplianceReports({ role })).toBe(true);
  for (const role of ['provider', 'support', 'client_guardian', undefined]) expect(canManageComplianceReports({ role })).toBe(false);
  expect(canManageComplianceReports({ role: 'admin', is_demo: 1 })).toBe(false);
  expect(fullSuiteDestination({ params: { section: 'compliance' }, fullPath: '/synthetic/compliance' }, { params: { section: 'appointments' } })).toBeNull();
});
