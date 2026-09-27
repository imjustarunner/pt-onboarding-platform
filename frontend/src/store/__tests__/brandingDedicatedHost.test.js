import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAgencyStore } from '../agency';
import { useAuthStore } from '../auth';
import { useBrandingStore } from '../branding';

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} }))
  }
}));
vi.mock('../../utils/fontLoader', () => ({ loadFont: vi.fn(() => Promise.resolve()) }));
vi.mock('../../utils/preloadImages', () => ({ preloadImages: vi.fn(() => Promise.resolve()) }));
vi.mock('../../utils/pageLoader', () => ({ trackPromise: vi.fn((promise) => promise) }));

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('dedicated host branding', () => {
  it('changes all palette tokens together on HQ tenant switches and preserves customization', () => {
    setActivePinia(createPinia());
    const branding = useBrandingStore();
    const agency = useAgencyStore();
    useAuthStore().setAuth(null, { id: 7, role: 'super_admin' });
    const legacy = { primary: '#0F172A', secondary: '#1E40AF', accent: '#F97316' };
    for (const [slug, primary, secondary, accent] of [
      ['itsco', '#086653', '#064C41', '#46D6B5'],
      ['nlu', '#092E58', '#008591', '#008591'],
      ['tisi', '#12364B', '#2F6B3A', '#2F6B3A']
    ]) {
      branding.setActiveRouteSlug(slug);
      agency.setCurrentAgency({ id: 2, slug, color_palette: legacy });
      branding.setPortalThemeData({ slug, colorPalette: legacy });
      branding.syncDocumentThemeFromSelectedAgency();
      expect([branding.primaryColor, branding.secondaryColor, branding.accentColor]).toEqual([primary, secondary, accent]);
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe(primary);
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe(accent);
    }
    branding.setPortalThemeData({ slug: 'tisi', colorPalette: { primary: '#234567', secondary: '#345678', accent: '#456789' } });
    expect(branding.primaryColor).toBe('#234567');
  });
  it('uses bundled ITSCO assets when the fetched host theme has no logo or icon', () => {
    setActivePinia(createPinia());
    const branding = useBrandingStore();
    branding.platformBranding = { organization_logo_url: '/logos/platform.png' };
    branding.portalHostPortalUrl = 'itsco';
    branding.setPortalThemeData({
      slug: 'itsco',
      agencyName: 'ITSCO',
      brandingAgencyId: 2,
      portalOrganizationId: 2,
      logoUrl: null,
      iconUrl: null,
      colorPalette: { accent: '#F97316', primary: '#0F172A', secondary: '#1E40AF' },
      themeSettings: { useExtendedBrandingColors: true }
    });
    expect(branding.displayName).toBe('ITSCO');
    expect(branding.displayLogoUrl).toContain('/assets/itsco/logo.png');
    expect(branding.displayChromeIconUrl).toContain('/assets/itsco/logo.png');
    expect(branding.primaryColor).toBe('#086653');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#086653');
  });

  it('uses the tenant logo for compact chrome when a separate tenant icon is missing', () => {
    setActivePinia(createPinia());
    const branding = useBrandingStore();
    useAuthStore().setAuth(null, { id: 7, role: 'super_admin' });
    branding.platformBranding = { organization_logo_url: '/logos/platform.png', organization_logo_icon_path: 'platform-icon.png' };
    branding.portalHostPortalUrl = 'itsco';
    branding.setPortalThemeData({ slug: 'itsco', agencyName: 'ITSCO', logoUrl: '/assets/itsco/logo.png' });
    expect(branding.displayChromeIconUrl).toContain('/assets/itsco/logo.png');
  });

  it('never borrows another tenant or platform assets while the host theme is pending', () => {
    setActivePinia(createPinia());
    const branding = useBrandingStore();
    useAuthStore().setAuth(null, { id: 7, role: 'super_admin' });
    useAgencyStore().setCurrentAgency({ id: 22, slug: 'tisi', name: 'TISI', logo_url: '/assets/tisi/logo.png', color_palette: { primary: '#900000' } });
    branding.platformBranding = { organization_name: 'PlotTwist', organization_logo_url: '/logos/platform.png', primary_color: '#8b5cf6' };
    branding.portalHostPortalUrl = 'itsco';
    expect(branding.displayName).toBe('ITSCO');
    expect(branding.displayLogoUrl).toContain('/assets/itsco/logo.png');
    expect(branding.displayChromeIconUrl).toContain('/assets/itsco/logo.png');
    expect(branding.primaryColor).not.toBe('#900000');
    expect(branding.primaryColor).not.toBe('#8b5cf6');
  });

  it('uses a neutral missing-logo state for an unknown tenant, never the platform mark', () => {
    setActivePinia(createPinia());
    const branding = useBrandingStore();
    branding.platformBranding = { organization_logo_url: '/logos/platform.png' };
    branding.portalHostPortalUrl = 'new-tenant';
    expect(branding.displayLogoUrl).toBeNull();
    expect(branding.displayChromeIconUrl).toBeNull();
    expect(branding.displayName).toBe('NEW-TENANT');
  });

  it('uses the host portal on flat routes even when a superadmin has another currentAgency selected', () => {
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    const agencyStore = useAgencyStore();
    const brandingStore = useBrandingStore();

    authStore.setAuth(null, { id: 7, role: 'super_admin', email: 'admin@example.test' });
    agencyStore.setCurrentAgency({
      id: 22,
      name: 'The Inner Strength Institute',
      slug: 'tisi',
      color_palette: { primary: '#900000' },
      logo_path: 'uploads/tisi-logo.png',
      icon_file_path: 'uploads/tisi-icon.png'
    });

    brandingStore.portalHostPortalUrl = 'itsco';
    brandingStore.setActiveRouteSlug('');
    brandingStore.setPortalThemeData({
      slug: 'itsco',
      agencyName: 'ITSCO',
      colorPalette: { primary: '#0f766e' },
      logoUrl: '/assets/itsco/logo.png',
      iconUrl: '/assets/itsco/icon.png',
      themeSettings: { fontFamily: 'Inter' }
    });

    expect(brandingStore.displayName).toBe('ITSCO');
    expect(brandingStore.agencyName).toBe('ITSCO');
    expect(brandingStore.primaryColor).toBe('#0f766e');
    expect(brandingStore.displayLogoUrl).toContain('/assets/itsco/logo.png');
    expect(brandingStore.displayChromeIconUrl).toContain('/assets/itsco/icon.png');
  });
});
