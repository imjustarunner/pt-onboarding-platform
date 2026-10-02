import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAgencyStore } from '../agency';
import { useAuthStore } from '../auth';
import { useBrandingStore } from '../branding';
import api from '../../services/api';
import { clearAdminApiCache, getCached } from '../../utils/adminApiCache';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../utils/fontLoader', () => ({ loadFont: vi.fn() }));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearAdminApiCache();
  setActivePinia(createPinia()); vi.clearAllMocks();
  useAuthStore().setAuth(null, { id: 1, role: 'super_admin' });
});

describe('dashboard icon branding', () => {
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
