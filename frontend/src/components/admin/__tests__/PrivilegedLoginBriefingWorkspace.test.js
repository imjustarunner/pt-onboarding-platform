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
  it('stays dismissed across remounts and query navigation, but opens manually', async () => {
    render();
    await flushPromises();
    document.querySelector('.briefing-close').click();
    wrapper.unmount();
    await router.push('/admin?panel=messages');
    render();
    await flushPromises();
    expect(document.querySelector('.briefing-modal')).toBeNull();
    window.dispatchEvent(new CustomEvent('app:open-command-center'));
    await flushPromises();
    expect(document.querySelector('.briefing-modal')).not.toBeNull();
    document.querySelector('.briefing-close').click();
    await router.push('/admin?panel=organizations');
    await flushPromises();
    expect(document.querySelector('.briefing-modal')).toBeNull();
  });

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
    document.querySelector('.briefing-card--green .card-link:last-child').click();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/itsco/tasks');
  });

  it('keeps item and recent browsing inside the briefing with Back navigation', async () => {
    render();
    await flushPromises();
    const originalCalls = api.get.mock.calls.length;
    document.querySelector('.briefing-card--green .card-link').click();
    await flushPromises();
    expect(document.querySelector('.briefing-browser').textContent).toContain('ITSCO task');
    document.querySelector('.browser-item').click();
    await flushPromises();
    expect(document.querySelector('.briefing-detail h2').textContent).toBe('ITSCO task');
    expect(router.currentRoute.value.path).toBe('/admin');
    expect(api.get.mock.calls.length).toBe(originalCalls + 1);
    document.querySelector('.browser-back').click();
    await flushPromises();
    expect(document.querySelector('.browser-item')).not.toBeNull();
    document.querySelector('.browser-back').click();
    await flushPromises();
    expect(document.querySelector('.briefing-browser')).toBeNull();
    expect(document.querySelector('.briefing-modal')).not.toBeNull();
  });

  it('does not reopen after a full-page action when workspace identity updates', async () => {
    render();
    await flushPromises();
    document.querySelector('.briefing-card--green .card-link:last-child').click();
    await flushPromises();
    const requests = api.get.mock.calls.length;
    useBrandingStore().portalHostPortalUrl = null;
    useBrandingStore().clearPortalTheme();
    useAgencyStore().setPlatformMode();
    await flushPromises();
    expect(document.querySelector('.briefing-modal')).toBeNull();
    expect(api.get.mock.calls.length).toBe(requests);
    await wrapper.setProps({ loginTrigger: 2 });
    await flushPromises();
    expect(document.querySelector('.briefing-modal')).not.toBeNull();
  });

  it('shows overdue items beyond the three previews in the urgent list', async () => {
    const original = api.get.getMockImplementation();
    api.get.mockImplementation(path => path === '/tasks' ? Promise.resolve({ data: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, title: `Overdue ${i}`, due_date: '2020-01-01', status: 'pending' })) }) : original(path));
    render();
    await flushPromises();
    expect(document.querySelectorAll('.briefing-card--green .briefing-item')).toHaveLength(3);
    expect(document.querySelector('.urgent-card strong').textContent).toBe('6');
    document.querySelector('.urgent-card').click();
    await flushPromises();
    expect(document.querySelectorAll('.browser-item')).toHaveLength(6);
    document.querySelectorAll('.browser-item')[5].click();
    await flushPromises();
    expect(document.querySelector('.briefing-detail h2').textContent).toBe('Overdue 5');
    expect(router.currentRoute.value.path).toBe('/admin');
  });

  it('retains every tenant and ranks by recency, not name or visit count', async () => {
    const tenants = Array.from({ length: 18 }, (_, i) => ({ id: i + 10, name: `Tenant ${i}`, slug: `tenant-${i}`, organization_type: 'agency' }));
    localStorage.setItem('pt.tenantLastVisited:7', JSON.stringify({ 24: 1000, 12: 500 }));
    localStorage.setItem('pt.tenantVisitCount', JSON.stringify({ 10: 99 }));
    const original = api.get.getMockImplementation();
    api.get.mockImplementation(path => path === '/agencies' ? Promise.resolve({ data: tenants }) : original(path));
    render();
    await flushPromises();
    const names = [...document.querySelectorAll('.tenant-launcher')].map(el => el.title);
    expect(names).toHaveLength(18);
    expect(names.slice(0, 2)).toEqual(['Tenant 14', 'Tenant 2']);
  });

  it('does not continue loading a dismissed briefing after an in-flight request resolves', async () => {
    let finish;
    const original = api.get.getMockImplementation();
    api.get.mockImplementation(path => path === '/agencies' ? new Promise(resolve => { finish = resolve; }) : original(path));
    render();
    document.querySelector('.briefing-close').click();
    finish({ data: [itsco, tisi] });
    await flushPromises();
    expect(document.querySelector('.briefing-modal')).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith('/tasks', expect.anything());
  });

  it('shows the newest tasks in previews while keeping all loaded tasks available', async () => {
    const original = api.get.getMockImplementation();
    api.get.mockImplementation(path => path === '/tasks' ? Promise.resolve({ data: [
      { id: 1, title: 'Older', created_at: '2020-01-01', status: 'pending' },
      { id: 2, title: 'Newest', created_at: '2026-01-01', status: 'pending' }
    ] }) : original(path));
    render();
    await flushPromises();
    expect(document.querySelector('.briefing-card--green .briefing-item strong').textContent).toBe('Newest');
  });
});
