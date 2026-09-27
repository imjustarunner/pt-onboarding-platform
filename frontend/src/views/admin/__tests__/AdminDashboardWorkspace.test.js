import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AdminDashboard from '../AdminDashboard.vue';

const state = vi.hoisted(() => ({
  route: { path: '/admin', params: {}, query: {}, hash: '' },
  agency: { currentAgency: null, setPlatformMode: vi.fn() },
  branding: { portalHostPortalUrl: null },
  router: { replace: vi.fn().mockResolvedValue(), push: vi.fn() }
}));
vi.mock('vue-router', () => ({ useRoute: () => state.route, useRouter: () => state.router }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1, role: 'super_admin' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => state.agency }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => state.branding }));
vi.mock('../../../composables/useSuperadminPlatformPreview', () => ({ useSuperadminPlatformPreview: () => ({ isSuperadminPreview: false }) }));
vi.mock('../../../utils/loginRemember', () => ({ setRememberedGoogleLogin: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { post: vi.fn().mockResolvedValue({}) } }));
vi.mock('../SuperAdminDashboard.vue', () => ({ default: { template: '<div>Classic HQ</div>' } }));
vi.mock('../SuperadminPlatformDashboard.vue', () => ({ default: { template: '<div>HQ workspace</div>' } }));
vi.mock('../AgencyAdminDashboard.vue', () => ({ default: { template: '<div>Classic tenant</div>' } }));
vi.mock('../TenantAdminDashboard.vue', () => ({ default: { template: '<div>Tenant workspace</div>' } }));

describe('admin landing workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.route = { path: '/admin', params: {}, query: {}, hash: '' };
    state.branding.portalHostPortalUrl = null;
    state.agency.currentAgency = null;
  });

  it('renders the tenant dashboard on ITSCO even before agency hydration', () => {
    state.branding.portalHostPortalUrl = 'itsco';
    const wrapper = mount(AdminDashboard);
    expect(wrapper.text()).toBe('Tenant workspace');
    wrapper.unmount();
  });

  it('does not reset tenant context after Google login', async () => {
    state.branding.portalHostPortalUrl = 'itsco';
    state.route.query = { sso: '1', ssoOrg: 'itsco' };
    const wrapper = mount(AdminDashboard);
    await flushPromises();
    expect(wrapper.text()).toBe('Tenant workspace');
    expect(state.agency.setPlatformMode).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('renders a tenant dashboard for an HQ tenant URL', () => {
    state.route.params = { organizationSlug: 'tisi' };
    const wrapper = mount(AdminDashboard);
    expect(wrapper.text()).toBe('Tenant workspace');
    wrapper.unmount();
  });

  it('renders HQ at the platform address despite a persisted tenant filter', () => {
    state.agency.currentAgency = { id: 2, slug: 'tisi' };
    const wrapper = mount(AdminDashboard);
    expect(wrapper.text()).toBe('HQ workspace');
    wrapper.unmount();
  });
});
