import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import Briefing from '../PrivilegedLoginBriefingModal.vue';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import { useBrandingStore } from '../../../store/branding';
import api from '../../../services/api';
import { openPlatformWorkspace } from '../../../services/workspaceNavigation';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../utils/fontLoader', () => ({ loadFont: vi.fn().mockResolvedValue() }));
vi.mock('../../../utils/preloadImages', () => ({ preloadImages: vi.fn().mockResolvedValue() }));
vi.mock('../../../utils/pageLoader', () => ({ trackPromise: (promise) => promise }));
vi.mock('../../../services/workspaceNavigation', () => ({ openTenantWorkspace: vi.fn().mockResolvedValue(), openPlatformWorkspace: vi.fn().mockResolvedValue() }));
vi.mock('../../meetings/DashboardMeetings.vue', () => ({ default: { props: ['includeAllAgencies'], template: '<div />' } }));

const itsco = { id: 1, slug: 'itsco', name: 'ITSCO', logo_url: '/assets/itsco/logo.png', organization_type: 'agency' };
const tisi = { id: 2, slug: 'tisi', name: 'TISI', logo_url: '/assets/tisi/logo.png', organization_type: 'agency' };
let wrapper;
let pinia;
let router;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  api.get.mockImplementation(async (path) => {
    if (path === '/agencies') return { data: [itsco, tisi] };
    if (path === '/agencies/1') return { data: itsco };
    if (path === '/notifications/counts') return { data: { 1: 4, 2: 30, _total: 34 } };
    if (path === '/tasks') return { data: [{ id: 1, title: 'ITSCO task', status: 'pending' }] };
    return { data: [] };
  });
  pinia = createPinia();
  setActivePinia(pinia);
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/login', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' }, meta: { requiresAuth: true } }
  ] });
  await router.push('/admin');
  useAuthStore().setAuth(null, { id: 7, role: 'super_admin', firstName: 'Test' });
  useAgencyStore().setCurrentAgency(itsco);
  const branding = useBrandingStore();
  branding.portalHostPortalUrl = 'itsco';
  branding.platformBranding = { organization_name: 'PlotTwist HQ', organization_logo_url: '/logos/platform.png' };
  branding.setPortalThemeData({ slug: 'itsco', agencyName: 'ITSCO', logoUrl: itsco.logo_url, colorPalette: { primary: '#16733d' } });
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });
const render = () => {
  wrapper = mount(Briefing, { props: { loginTrigger: 1 }, global: { plugins: [pinia, router] }, attachTo: document.body });
};

describe('superadmin welcome briefing follows the workspace', () => {
  it('opens the HQ workspace from the explicit superadmin dashboard button', async () => {
    render();
    await flushPromises();
    document.querySelector('.superadmin-dashboard').click();
    await flushPromises();
    expect(openPlatformWorkspace).toHaveBeenCalledWith(router);
    expect(document.querySelector('.briefing-modal')).toBeNull();
  });

  it('does not expose a superadmin dashboard button to tenant administrators', async () => {
    useAuthStore().setAuth(null, { id: 8, role: 'admin', firstName: 'Test' });
    render();
    await flushPromises();
    expect(document.querySelector('.superadmin-dashboard')).toBeNull();
  });
  it('shows ITSCO branding immediately, scopes requests, and retains tenant shortcuts', async () => {
    render();
    expect(document.querySelector('.briefing-eyebrow').textContent).toBe('ITSCO command center');
    expect(document.querySelector('.brand-logo').getAttribute('src')).toContain('/assets/itsco/logo.png');
    expect(document.querySelector('.briefing-modal--platform')).toBeNull();
    await flushPromises();
    expect(document.querySelector('.card-count strong').textContent).toBe('4');
    expect(api.get).toHaveBeenCalledWith('/tasks', expect.objectContaining({ params: { agencyId: 1, tenantId: 1 } }));
    expect(document.querySelector('[aria-label="At a glance"]').textContent).toContain('ITSCOScope');
    expect(document.querySelector('.tenant-launchers').textContent).toContain('TISI');
  });

  it('does not display a briefing on the login screen before workspace resolution', async () => {
    await router.push('/login');
    render();
    expect(document.querySelector('.briefing-modal')).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith('/notifications/counts', expect.anything());
    await router.push('/admin');
    await flushPromises();
    expect(document.querySelector('.briefing-eyebrow').textContent).toBe('ITSCO command center');
  });

  it('uses platform scope only outside tenant URLs and avoids double-counting notification facets', async () => {
    const branding = useBrandingStore();
    branding.portalHostPortalUrl = null;
    branding.clearPortalTheme();
    useAgencyStore().setPlatformMode();
    render();
    await flushPromises();
    expect(document.querySelector('.briefing-eyebrow').textContent).toBe('Platform command center');
    expect(document.querySelector('.card-count strong').textContent).toBe('34');
    expect(api.get).toHaveBeenCalledWith('/tasks', expect.objectContaining({ params: {} }));
  });

  it('retains the tenant prefix on HQ tenant briefing actions', async () => {
    const branding = useBrandingStore();
    branding.portalHostPortalUrl = null;
    branding.setActiveRouteSlug('itsco');
    await router.push('/itsco/admin');
    render();
    await flushPromises();
    document.querySelector('.briefing-card--green .card-link').click();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/itsco/tasks');
  });
});
