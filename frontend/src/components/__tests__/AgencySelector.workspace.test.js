import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import AgencySelector from '../AgencySelector.vue';
import { readChosenOrganizationId, rememberChosenOrganization } from '../../utils/workingOrganization';

const m = vi.hoisted(() => ({ auth: null, agencies: null, route: null, post: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), resolve: ({ path }) => ({ href: path }) } }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => m.router }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => m.auth }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => m.agencies }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({ portalHostPortalUrl: 'itsco' }) }));
vi.mock('../../services/api', () => ({ default: { post: m.post } }));
vi.mock('../sstc/MySstcClubsCard.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../bookClub/BookClubPortalChip.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../utils/googleAccountMemory', () => ({ hasRememberedGoogleAccount: () => false }));
const full = { id: 450, slug: 'auricwell-qa-demo', name: 'ITSCOLLC', organization_type: 'agency' };
const limited = { id: 456, slug: 'scb-qa-company', name: 'SCB QA Company', organization_type: 'agency', feature_flags: { schoolCareBridgeOnly: true } };
let wrapper, location;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  m.auth = reactive({ user: { id: 1433, role: 'provider' } });
  m.agencies = reactive({ currentAgency: full, userAgencies: [full, limited], agencies: [full, limited],
    fetchUserAgencies: vi.fn(async () => {}), fetchAgencies: vi.fn(async () => {}),
    chooseOrganization: vi.fn(agency => { m.agencies.currentAgency = agency; rememberChosenOrganization(1433, agency.id); }) });
  m.route = reactive({ path: '/auricwell-qa-demo/dashboard', params: { organizationSlug: full.slug }, query: {} });
  m.router.push.mockResolvedValue();
  location = { hostname: 'app.itsco.health', assign: vi.fn(), replace: vi.fn() };
  const browserWindow = window;
  vi.stubGlobal('window', new Proxy(browserWindow, { get: (target, key) => key === 'location' ? location : Reflect.get(target, key, target) }));
});
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });

it('returns from SchoolCareBridge to the explicitly selected agency with a same-origin document navigation', async () => {
  wrapper = mount(AgencySelector); await flushPromises();
  await wrapper.get('select').setValue(limited.id); await flushPromises();
  expect(m.router.push).toHaveBeenCalledWith('/schoolcarebridge/app/partners/scb-qa-company');
  expect(readChosenOrganizationId(1433)).toBe(limited.id);
  m.route.path = '/schoolcarebridge/app/partners/scb-qa-company';
  m.route.params = { partnerSlug: limited.slug }; m.router.push.mockClear();
  await wrapper.get('select').setValue(full.id); await flushPromises();
  expect(location.assign).toHaveBeenCalledWith('https://app.itsco.health/auricwell-qa-demo/dashboard');
  expect(m.router.push).not.toHaveBeenCalled();
  expect(m.post).not.toHaveBeenCalled();
  expect(readChosenOrganizationId(1433)).toBe(full.id);
  expect(wrapper.get('select').element.value).toBe(String(full.id));
});
