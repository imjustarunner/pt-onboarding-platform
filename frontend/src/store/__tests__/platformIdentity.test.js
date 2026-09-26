import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBrandingStore } from '../branding';
import { useAgencyStore } from '../agency';
import { useAuthStore } from '../auth';
import { PLATFORM_BRAND, normalizePlatformBranding } from '../../config/platformBrand';
vi.mock('../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn() } }));
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });
afterEach(() => { vi.clearAllMocks(); });
describe('platform identity and agency isolation', () => {
  it('replaces legacy platform identity without dropping unrelated settings', () => {
    const normalized = normalizePlatformBranding({ organization_name: 'PlotTwistHQ', organization_logo_url: '/old.png', primary_color: '#C69A2B', accent_color: '#8B5CF6', dashboard_title: 'Overview' });
    expect(normalized.organization_name).toBe(PLATFORM_BRAND.name);
    expect(normalized.organization_logo_url).toBe(PLATFORM_BRAND.logo);
    expect(normalized.primary_color).toBe('#B80016');
    expect(normalized.accent_color).toBe('#B80016');
    expect(normalized.dashboard_title).toBe('Overview');
  });
  it('uses the platform mark and palette despite stale portal branding', () => {
    const auth = useAuthStore(), agency = useAgencyStore(), branding = useBrandingStore();
    auth.user = { id: 1, role: 'super_admin' };
    agency.platformMode = true; agency.currentAgency = null;
    branding.portalAgency = { slug: 'itsco', name: 'ITSCO', logoUrl: '/itsco.png', colorPalette: { primary: '#00AA00' } };
    branding.activeRouteSlug = null;
    expect(branding.displayLogoUrl).toBe(PLATFORM_BRAND.logo);
    expect(branding.displayChromeIconUrl).toBe(PLATFORM_BRAND.logo);
    expect(branding.primaryColor).toBe(PLATFORM_BRAND.primary);
  });
  it('preserves the selected agency identity in Settings', () => {
    const auth = useAuthStore(), agency = useAgencyStore(), branding = useBrandingStore();
    auth.user = { id: 1, role: 'super_admin' };
    agency.currentAgency = { id: 377, slug: 'tisi', logo_url: '/tisi.png', color_palette: { primary: '#255E66' } };
    agency.platformMode = false;
    branding.settingsTenantPickerBrandingActive = true;
    expect(branding.primaryColor).toBe('#255E66');
    expect(branding.displayLogoUrl).toContain('/tisi.png');
    expect(branding.displayChromeIconUrl).toContain('/tisi.png');
  });
});
