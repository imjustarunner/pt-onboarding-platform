import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBrandingStore } from '../branding';
import { useAgencyStore } from '../agency';
import { useAuthStore } from '../auth';
import { PLATFORM_BRAND } from '../../config/platformBrand';
vi.mock('../../services/api', () => ({ default: { get: vi.fn(async () => ({ data: [] })) } }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setActivePinia(createPinia()); });
describe('tenant login branding isolation', () => {
  for (const slug of ['itsco', 'tisi', 'nlu']) {
    it(`keeps ${slug} identity on a flat guest login with a saved platform context`, () => {
      const agency = useAgencyStore(); const auth = useAuthStore(); const branding = useBrandingStore();
      auth.user = null; agency.currentAgency = null; agency.platformMode = true;
      branding.portalHostPortalUrl = slug;
      branding.setPortalThemeFromLoginTheme({ agency: { name: slug, logoUrl: `/assets/${slug}/logo.png`, colorPalette: { primary: '#246348', accent: '#468563' } } });
      expect(branding.displayLogoUrl).toContain(`/assets/${slug}/logo.png`);
      expect(branding.primaryColor).toBe('#246348');
      expect(branding.accentColor).toBe('#468563');
      auth.user = { id: 1, role: 'super_admin' };
      expect(branding.primaryColor).toBe(PLATFORM_BRAND.primary);
      expect(branding.displayLogoUrl).toBe(PLATFORM_BRAND.logo);
    });
  }
});
