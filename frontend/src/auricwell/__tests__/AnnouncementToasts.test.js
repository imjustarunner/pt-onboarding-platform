import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ route: { params: { organizationSlug: 'itsco' } }, get: vi.fn(), request: vi.fn(), auth: {}, agency: {} }));
vi.mock('vue-router', () => ({ useRoute: () => mock.route }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => mock.auth }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => mock.agency }));
vi.mock('../../services/api', () => ({ default: { get: mock.get, request: mock.request } }));
vi.mock('../Records.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../Chart.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../components/portal/PortalIcon.vue', () => ({ default: { template: '<span />' } }));
import App from '../App.vue';
const context = { actor: { id: 9, role: 'super_admin', first_name: 'Test' }, practice: { id: 7, slug: 'itsco', name: 'Test Practice' } };
const mountApp = (props = {}) => mount(App, { props, global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mock.route.params = { organizationSlug: 'itsco' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => context }));
  mock.get.mockResolvedValue({ data: [{ id: 42, title: 'Administrative office closure', message: 'Provider appointments follow their individual schedules.', display_type: 'toast', starts_at: new Date(Date.now() - 60000).toISOString(), ends_at: new Date(Date.now() + 86400000).toISOString() }] });
  mock.request.mockResolvedValue({ data: [] });
});
it('shows office toasts throughout the authenticated AuricWell workspace and clears them when the session ends', async () => {
  const w = mountApp(); await flushPromises();
  expect(mock.get).toHaveBeenCalledWith('/auricwell-preview/toasts/active');
  expect(w.get('.announcement-toast').text()).toContain('Provider appointments follow their individual schedules.');
  expect(w.get('.aw-nav').text()).toContain('Announcements');
  window.dispatchEvent(new Event('auricwell-session-ended')); await flushPromises();
  expect(w.find('.announcement-toast').exists()).toBe(false); w.unmount();
});
it('offers practice and platform support toast editors without banner or splash controls', async () => {
  mock.route.params.section = 'announcements';
  const w = mountApp(); await flushPromises();
  expect(w.text()).toContain('Office toast announcements');
  expect(w.text()).toContain('AuricWell support announcements');
  expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/auricwell-preview/toasts' }));
  expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/platform/toast-announcements' }));
  expect(w.find('select').exists()).toBe(false); w.unmount();
});
it('keeps real announcement APIs and editors out of the public fictional demo', async () => {
  const w = mountApp({ demoContext: context }); await flushPromises();
  expect(fetch).not.toHaveBeenCalled(); expect(mock.get).not.toHaveBeenCalled(); expect(mock.request).not.toHaveBeenCalled();
  expect(w.find('.announcement-toast').exists()).toBe(false);
  expect(w.get('.aw-nav').text()).not.toContain('Announcements'); w.unmount();
});
