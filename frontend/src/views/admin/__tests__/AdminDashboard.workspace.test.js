import { beforeEach, expect, it, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
const state = vi.hoisted(() => ({
  user: { id: 1, role: 'super_admin' },
  route: { path: '/admin', params: {}, query: {} },
  branding: { portalHostPortalUrl: null }
}));
vi.mock('vue-router', () => ({ useRoute: () => state.route, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: state.user }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 377 } }) }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => state.branding }));
vi.mock('../../../utils/workspaceDestination', () => ({ isPlatformWorkspaceHost: () => false, isLocalWorkspaceHost: () => false }));
vi.mock('../../../auricwell/paths', () => ({ isAuricwellHost: () => true }));
vi.mock('../../../services/api', () => ({ default: { post: vi.fn(async () => ({})) } }));
vi.mock('../../../composables/useSuperadminPlatformPreview', () => ({ useSuperadminPlatformPreview: () => ({ isSuperadminPreview: false }) }));
vi.mock('../SuperadminPlatformDashboard.vue', () => ({ default: { name: 'SuperadminPlatformDashboard', template: '<div>Platform HQ</div>' } }));
vi.mock('../SuperAdminDashboard.vue', () => ({ default: { template: '<div>Classic HQ</div>' } }));
vi.mock('../AgencyAdminDashboard.vue', () => ({ default: { template: '<div>Classic tenant</div>' } }));
vi.mock('../TenantAdminDashboard.vue', () => ({ default: { name: 'TenantAdminDashboard', template: '<div>Tenant</div>' } }));
import AdminDashboard from '../AdminDashboard.vue';
beforeEach(() => { state.user.role = 'super_admin'; state.route.params = {}; state.branding.portalHostPortalUrl = null; });
it('opens platform HQ on the shared AuricWell origin despite a remembered tenant', () => {
  const wrapper = shallowMount(AdminDashboard);
  expect(wrapper.findComponent({ name: 'SuperadminPlatformDashboard' }).exists()).toBe(true);
  expect(wrapper.text()).not.toContain('Loading workspace');
  wrapper.unmount();
});
it('keeps a tenant-prefixed address on its tenant dashboard', () => {
  state.route.params = { organizationSlug: 'tisi' };
  const wrapper = shallowMount(AdminDashboard);
  expect(wrapper.findComponent({ name: 'TenantAdminDashboard' }).exists()).toBe(true);
  expect(wrapper.findComponent({ name: 'SuperadminPlatformDashboard' }).exists()).toBe(false);
  wrapper.unmount();
});
it('does not grant a provider the platform dashboard', () => {
  state.user.role = 'provider';
  const wrapper = shallowMount(AdminDashboard);
  expect(wrapper.findComponent({ name: 'SuperadminPlatformDashboard' }).exists()).toBe(false);
  expect(wrapper.text()).toContain('Access denied');
  wrapper.unmount();
});
