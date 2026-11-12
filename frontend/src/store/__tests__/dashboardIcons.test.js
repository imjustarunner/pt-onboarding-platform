import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { useAgencyStore } from '../agency';
import { useAuthStore } from '../auth';
import { useBrandingStore } from '../branding';
import api from '../../services/api';
import { clearAdminApiCache, getCached } from '../../utils/adminApiCache';
import { isLoading } from '../../utils/pageLoader';
import { preloadImages } from '../../utils/preloadImages';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../utils/fontLoader', () => ({ loadFont: vi.fn() }));
vi.mock('../../utils/preloadImages', () => ({ preloadImages: vi.fn() }));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearAdminApiCache();
  setActivePinia(createPinia()); vi.clearAllMocks();
  preloadImages.mockResolvedValue({ loaded: 0 });
  useAuthStore().setAuth(null, { id: 1, role: 'super_admin' });
});

describe('dashboard icon branding', () => {
  it('shares overlapping startup branding reads while allowing a newer forced refresh to win', async () => {
    const finishes = [];
    api.get.mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
    const branding = useBrandingStore();
    const first = branding.fetchPlatformBranding();
    const second = branding.fetchPlatformBranding();
    await flushPromises();
    expect(api.get).toHaveBeenCalledTimes(1);
    const refreshed = branding.fetchPlatformBranding(true);
    await flushPromises();
    expect(api.get).toHaveBeenCalledTimes(2);
    finishes[1]({ data: { id: 2 } });
    await refreshed;
    finishes[0]({ data: { id: 1 } });
    await Promise.all([first, second]);
    expect(branding.platformBranding.id).toBe(2);
    api.get.mockResolvedValue({ data: { id: 3 } });
    await branding.fetchPlatformBranding();
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(branding.platformBranding.id).toBe(3);
  });

  it('bounds the fast sign-in handoff when an image server does not respond', async () => {
    vi.useFakeTimers();
    try {
      preloadImages.mockReturnValue(new Promise(() => {}));
      const branding = useBrandingStore();
      branding.portalHostPortalUrl = 'itsco';
      branding.setPortalThemeFromLoginTheme({ agency: { name: 'ITSCO', dashboardIcons: {
        fields: { my_dashboard_clients_icon_id: 93 }, pathsById: { 93: 'icons/clients.svg' }
      } } });
      let finished = false;
      const ready = branding.prepareDashboardIcons().then(() => { finished = true; });
      await vi.advanceTimersByTimeAsync(1199);
      expect(finished).toBe(false);
      await vi.advanceTimersByTimeAsync(1); await ready;
      expect(finished).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('warms configured icons on the login page and reuses them immediately after sign-in', () => {
    const branding = useBrandingStore();
    useAuthStore().user = null;
    branding.portalHostPortalUrl = 'itsco';
    branding.setPortalThemeFromLoginTheme({ agency: {
      name: 'ITSCO', dashboardIcons: {
        fields: { my_dashboard_clients_icon_id: 93, my_dashboard_clients_icon_path: 'icons/clients.svg' },
        pathsById: { 93: 'icons/clients.svg', 94: 'icons/custom.svg' }
      }
    } });
    expect(preloadImages).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining('/icons/clients.svg')]), expect.any(Object));
    useAuthStore().setAuth(null, { id: 7, role: 'provider' });
    useAgencyStore().currentAgency = { id: 2, slug: 'itsco', my_dashboard_clients_icon_id: 93,
      theme_settings: { dashboardIconOverrides: { dashboard: { overview: 94 } } } };
    expect(branding.getDashboardCardIconUrl('clients')).toContain('/icons/clients.svg');
    expect(branding.getDashboardIconOverrideUrl('dashboard', 'overview')).toContain('/icons/custom.svg');
    expect(api.get).not.toHaveBeenCalled();
    branding.setActiveRouteSlug('nlu');
    expect(branding.getDashboardCardIconUrl('clients')).toBeNull();
  });

  it('keeps NLU, PlotTwistCo, and platform assignments separate', () => {
    const agencies = useAgencyStore(); const branding = useBrandingStore();
    agencies.agencies = [
      { id: 6, slug: 'nlu', my_dashboard_my_schedule_icon_path: 'icons/nlu.png' },
      { id: 1, slug: 'plottwistco', my_dashboard_my_schedule_icon_path: 'icons/ptco.png' }
    ];
    branding.platformBranding = { id: 12, dashboard_icon_overrides: JSON.stringify({ dashboard: { overview: 57 } }) };
    branding.iconFilePathCache = { 57: 'icons/platform.png' };
    branding.setActiveRouteSlug('nlu');
    expect(branding.dashboardIconEditingTarget.id).toBe(6);
    expect(branding.getDashboardCardIconUrl('my_schedule')).toContain('nlu.png');
    expect(branding.getDashboardIconOverrideId('dashboard', 'overview')).toBeNull();
    branding.setActiveRouteSlug('plottwistco');
    expect(branding.dashboardIconEditingTarget.id).toBe(1);
    expect(branding.getDashboardCardIconUrl('my_schedule')).toContain('ptco.png');
    branding.setActiveRouteSlug(''); branding.portalHostPortalUrl = null;
    expect(branding.dashboardIconEditingTarget.isPlatform).toBe(true);
    expect(branding.getDashboardIconOverrideUrl('dashboard', 'overview')).toContain('platform.png');
  });

  it('does not offer a platform editor while a tenant is still loading', () => {
    const branding = useBrandingStore();
    branding.platformBranding = { id: 12 };
    branding.portalHostPortalUrl = 'nlu';
    expect(branding.dashboardIconEditingTarget).toBeNull();
  });

  it('resolves the active host tenant instead of another persisted tenant', () => {
    const agencies = useAgencyStore(); const branding = useBrandingStore();
    agencies.currentAgency = { id: 9, slug: 'demo', my_dashboard_my_account_icon_path: 'icons/demo.png' };
    agencies.agencies = [{ id: 2, slug: 'itsco', my_dashboard_my_account_icon_path: 'icons/original.png' }];
    branding.portalHostPortalUrl = 'itsco';
    expect(branding.dashboardIconOrganization.id).toBe(2);
    expect(branding.getDashboardCardIconUrl('my')).toContain('/icons/original.png');
    expect(branding.getDashboardCardIconUrl('my', null)).toBeNull();
  });

  it('resolves saved icon IDs when joined file paths are missing', async () => {
    const agencies = useAgencyStore(); const branding = useBrandingStore();
    agencies.currentAgency = { id: 2, slug: 'itsco', my_dashboard_my_schedule_icon_id: 93 };
    api.get.mockResolvedValue({ data: { file_path: 'icons/schedule.png' } });
    expect(branding.getDashboardCardIconUrl('my_schedule')).toBeNull();
    await branding.prefetchIconIds([93]);
    expect(branding.getDashboardCardIconUrl('my_schedule')).toContain('/icons/schedule.png');
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('leaves the page usable while missing icons and decorative images are still loading', async () => {
    let finishIcon;
    let finishImages;
    preloadImages.mockReturnValue(new Promise(resolve => { finishImages = resolve; }));
    api.get.mockImplementation(url => url === '/platform-branding'
      ? Promise.resolve({ data: {
        organization_logo_path: 'logos/platform.png',
        manage_agencies_icon_id: 101, manage_agencies_icon_path: 'icons/agencies.png',
        manage_users_icon_id: 102
      } })
      : new Promise(resolve => { finishIcon = resolve; }));
    const branding = useBrandingStore();
    await branding.fetchPlatformBranding();

    expect(api.get.mock.calls.map(([url]) => url)).toEqual(['/platform-branding']);
    expect(branding.iconUrlById(101)).toContain('/icons/agencies.png');
    expect(preloadImages).toHaveBeenCalledWith(expect.arrayContaining(['/logos/platform.png']), expect.any(Object));
    expect(preloadImages.mock.calls[0][0].some(url => url.includes('/icons/'))).toBe(false);
    expect(isLoading.value).toBe(false);

    // An icon is resolved only when a rendered component asks to display it.
    expect(branding.iconUrlById(102)).toBeNull();
    expect(api.get.mock.calls.map(([url]) => url)).toEqual(['/platform-branding', '/icons/102']);
    finishIcon({ data: { file_path: 'icons/users.png' } });
    finishImages({ loaded: 1 });
    await flushPromises();
    expect(branding.iconUrlById(102)).toContain('/icons/users.png');
  });

  it('does not fetch unused platform artwork when startup branding arrives', async () => {
    const unusedIcons = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`unused_${i}_icon_id`, i + 100]));
    api.get.mockResolvedValue({ data: unusedIcons });
    const branding = useBrandingStore();
    await branding.fetchPlatformBranding();
    await flushPromises();
    expect(api.get.mock.calls.map(([url]) => url)).toEqual(['/platform-branding']);
    await branding.setPlatformBrandingFromResponse(unusedIcons);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('bounds concurrent icon requests across callers and drains the queue after a failure', async () => {
    const pending = new Map();
    let active = 0;
    let peak = 0;
    api.get.mockImplementation(url => {
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve, reject) => pending.set(url, { resolve, reject }))
        .finally(() => { active--; });
    });
    const branding = useBrandingStore();
    const first = branding.prefetchIconIds([101, 102, 103, 104, 105, 106]);
    const second = branding.prefetchIconIds([105, 107, 108, 109, 110]);
    expect(api.get).toHaveBeenCalledTimes(4);

    pending.get('/icons/101').reject(new Error('temporarily unavailable'));
    pending.delete('/icons/101');
    await flushPromises();
    expect(api.get).toHaveBeenCalledTimes(5);
    while (pending.size) {
      for (const [url, request] of [...pending]) {
        pending.delete(url);
        request.resolve({ data: { file_path: `${url.slice(1)}.png` } });
      }
      await flushPromises();
    }
    await Promise.all([first, second]);
    expect(peak).toBe(4);
    expect(api.get).toHaveBeenCalledTimes(10);
    expect(api.get.mock.calls.filter(([url]) => url === '/icons/105')).toHaveLength(1);
    expect(branding.iconFilePathById(101)).toBeNull();
    expect(branding.iconUrlById(110)).toContain('/icons/110.png');
  });

  it('reuses updated paths from a saved branding response without fetching those IDs', async () => {
    const branding = useBrandingStore();
    branding.iconFilePathCache = { 101: 'icons/old.png' };
    await branding.setPlatformBrandingFromResponse({
      manage_agencies_icon_id: 101, manage_agencies_icon_path: 'icons/new.png'
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(branding.iconUrlById(101)).toContain('/icons/new.png');
  });

  it('applies per-card changes immediately, preserves settings, and refreshes hydration cache', () => {
    const agencies = useAgencyStore(); const branding = useBrandingStore();
    agencies.currentAgency = { id: 2, slug: 'itsco', name: 'ITSCO', affiliated_agency_id: 10 };
    agencies.userAgencies = [agencies.currentAgency];
    branding.iconFilePathCache = { 57: 'icons/custom.png' };
    const saved = { id: 2, slug: 'itsco', theme_settings: { fontFamily: 'Inter', dashboardIconOverrides: { dashboard: { overview: 57 } } } };
    agencies.applyBrandingResponse(saved);
    expect(branding.getDashboardIconOverrideUrl('dashboard', 'overview')).toContain('custom.png');
    expect(branding.getDashboardIconOverrideUrl('dashboard', 'my')).toBeNull();
    expect(branding.getDashboardIconOverrideUrl('admin', 'overview')).toBeNull();
    expect(agencies.currentAgency.affiliated_agency_id).toBe(10);
    expect(agencies.userAgencies[0].theme_settings.fontFamily).toBe('Inter');
    expect(getCached('/agencies/2')).toEqual(saved);
    expect(JSON.parse(localStorage.getItem('currentAgency')).theme_settings.dashboardIconOverrides.dashboard.overview).toBe(57);
  });
});
