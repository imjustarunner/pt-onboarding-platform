import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import SchoolCareBridgeEntryView from '../SchoolCareBridgeEntryView.vue';
import SchoolCareBridgePartnerView from '../SchoolCareBridgePartnerView.vue';
import { readChosenOrganizationId, rememberChosenOrganization } from '../../../utils/workingOrganization';

const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), auth: null, agencies: null, branding: null,
  route: null, router: { push: vi.fn(), replace: vi.fn(), resolve: ({ path }) => ({ href: path }) } }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => m.router }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => m.auth }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => m.agencies }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => m.branding }));
vi.mock('../../../store/organization', () => ({ useOrganizationStore: () => ({}) }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, post: m.post } }));
vi.mock('../../../utils/googleAccountMemory', () => ({ hasRememberedGoogleAccount: () => false }));
vi.mock('../../LoginView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../OrganizationDashboardView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/availability/ProviderSchoolDays.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/schoolcarebridge/SchoolCareBridgeBrand.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/legal/ServiceUseNotice.vue', () => ({ default: { template: '<div />' } }));

const limited = { id: 460, slug: 'schoolcarebridge-qa', organization_type: 'agency', feature_flags: { schoolCareBridgeOnly: true } };
const full = { id: 450, slug: 'auricwell-qa-demo', name: 'ITSCOLLC', organization_type: 'agency' };
const other = { id: 461, slug: 'another-agency', organization_type: 'agency' };
let wrapper, location, partnerResponse;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  m.auth = reactive({ isAuthenticated: true, user: { id: 1434, role: 'support' }, logout: vi.fn() });
  m.agencies = reactive({ userAgencies: [limited, full], currentAgency: limited, fetchUserAgencies: vi.fn(async () => {}) });
  m.branding = reactive({ portalHostPortalUrl: null });
  m.route = reactive({ params: {}, query: {}, path: '/schoolcarebridge/app' });
  partnerResponse = { ...full, workspaceMode: 'connected', settings: {} };
  m.get.mockImplementation(async url => {
    if (url === '/schoolcarebridge/my-schools') return { data: { schools: [] } };
    if (url === '/schoolcarebridge/my-partners') return { data: { partners: [] } };
    if (url.startsWith('/schoolcarebridge/tenants/')) return { data: { partner: partnerResponse, schools: [], providers: [], canManage: false } };
    throw new Error(`Unexpected API request: ${url}`);
  });
  m.post.mockResolvedValue({ data: { handoffToken: 'one-time-code' } });
  location = { hostname: 'schoolcarebridge.org', origin: 'https://schoolcarebridge.org', assign: vi.fn(), replace: vi.fn() };
  const browserWindow = window;
  vi.stubGlobal('window', new Proxy(browserWindow, { get: (target, key) => key === 'location' ? location : Reflect.get(target, key, target) }));
});
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.unstubAllGlobals(); });
async function render(component = SchoolCareBridgeEntryView) {
  if (component === SchoolCareBridgePartnerView) {
    m.route.params = { partnerSlug: partnerResponse.slug };
    m.route.path = `/schoolcarebridge/app/partners/${partnerResponse.slug}`;
  }
  wrapper = mount(component, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
  await flushPromises();
}
function exitButton() { return wrapper.findAll('button').find(button => /(?:Open|Full) agency workspace/.test(button.text())); }
async function openWorkspace() { const button = exitButton(); expect(button).toBeTruthy(); await button.trigger('click'); await flushPromises(); }

describe('SchoolCareBridge agency exits', () => {
  it.each(['schoolcarebridge.org', 'app.itsco.health'])('opens the full QA agency on the existing %s session origin', async hostname => {
    location.hostname = hostname; location.origin = `https://${hostname}`;
    if (hostname === 'app.itsco.health') m.branding.portalHostPortalUrl = 'itsco';
    rememberChosenOrganization(1434, limited.id);
    localStorage.setItem('authToken', 'synthetic-existing-session');
    await render();
    expect(readChosenOrganizationId(1434)).toBe(limited.id);
    await openWorkspace();
    expect(location.assign).toHaveBeenCalledWith(`https://${hostname}/auricwell-qa-demo/dashboard`);
    expect(m.post).not.toHaveBeenCalled();
    expect(m.router.push).not.toHaveBeenCalled();
    expect(readChosenOrganizationId(1434)).toBe(full.id);
    expect(localStorage.getItem('authToken')).toBe('synthetic-existing-session');
    expect(m.auth.logout).not.toHaveBeenCalled();
  });
  it('honors the saved full-agency choice instead of the first membership', async () => {
    m.agencies.userAgencies = [other, limited, full]; m.agencies.currentAgency = other;
    rememberChosenOrganization(1434, full.id);
    await render(); await openWorkspace();
    expect(location.assign).toHaveBeenCalledWith('https://schoolcarebridge.org/auricwell-qa-demo/dashboard');
  });
  it('retains the current authorized full agency when no choice has been saved', async () => {
    m.agencies.userAgencies = [other, full]; m.agencies.currentAgency = full;
    await render(); expect(readChosenOrganizationId(1434)).toBeNull(); await openWorkspace();
    expect(location.assign).toHaveBeenCalledWith('https://schoolcarebridge.org/auricwell-qa-demo/dashboard');
  });
  it('does not offer an agency exit for only school or SchoolCareBridge memberships', async () => {
    m.agencies.userAgencies = [limited, { id: 451, slug: 'qa-school', organization_type: 'school' }];
    rememberChosenOrganization(1434, full.id); // A removed membership is not authorization.
    await render();
    expect(exitButton()).toBeUndefined();
    expect(wrapper.text()).toContain('No full agency workspace is available to your account.');
    expect(location.assign).not.toHaveBeenCalled();
  });
  it('does not offer school staff an agency exit', async () => {
    m.auth.user.role = 'school_staff'; await render();
    expect(exitButton()).toBeUndefined();
  });
  it('loads memberships before offering the connected partner exit', async () => {
    m.agencies.userAgencies = [];
    m.agencies.fetchUserAgencies.mockImplementation(async () => { m.agencies.userAgencies = [limited, full]; });
    await render(SchoolCareBridgePartnerView); await openWorkspace();
    expect(m.agencies.fetchUserAgencies).toHaveBeenCalledTimes(1);
    expect(location.assign).toHaveBeenCalledWith('https://schoolcarebridge.org/auricwell-qa-demo/dashboard');
  });
  it('opens the connected partner rather than an unrelated saved agency', async () => {
    m.agencies.userAgencies = [other, full]; rememberChosenOrganization(1434, other.id);
    await render(SchoolCareBridgePartnerView); await openWorkspace();
    expect(location.assign).toHaveBeenCalledWith('https://schoolcarebridge.org/auricwell-qa-demo/dashboard');
    expect(readChosenOrganizationId(1434)).toBe(full.id);
  });
  it('does not substitute another full agency when the partner membership is absent', async () => {
    m.agencies.userAgencies = [other]; await render(SchoolCareBridgePartnerView);
    expect(exitButton()).toBeUndefined();
    expect(wrapper.text()).toContain('No full agency workspace is available to your account.');
  });
  it('does not expose a full workspace for a standalone partner', async () => {
    partnerResponse.workspaceMode = 'standalone'; await render(SchoolCareBridgePartnerView);
    expect(exitButton()).toBeUndefined();
  });
  it('preserves the superadmin handoff for an authorized connected partner without a membership row', async () => {
    m.auth.user.role = 'super_admin'; m.agencies.userAgencies = [other];
    await render(SchoolCareBridgePartnerView); await openWorkspace();
    expect(m.post).toHaveBeenCalledWith('/auth/brand-switch/handoff', { targetHost: 'plottwisthq.com', agencyId: full.id, rememberGoogle: false }, { skipGlobalLoading: true });
    expect(location.assign).toHaveBeenCalledWith('https://plottwisthq.com/auricwell-qa-demo/dashboard?bs=one-time-code');
    expect(m.agencies.currentAgency.id).toBe(limited.id);
  });
  it('keeps a known SchoolCareBridge-only membership out of the full workspace even for superadmins', async () => {
    m.auth.user.role = 'super_admin'; partnerResponse = { ...limited, workspaceMode: 'connected', settings: {} };
    await render(SchoolCareBridgePartnerView);
    expect(exitButton()).toBeUndefined();
  });
});
