import { describe, expect, it, vi } from 'vitest';
import { startStartupBranding } from '../startupBranding';

function fixture() {
  let resolve;
  const branding = {
    initializePortalTheme: vi.fn(() => new Promise(done => { resolve = done; })),
    fetchPlatformBranding: vi.fn(() => new Promise(() => {})),
    fetchAgencyTheme: vi.fn(async () => {}), clearPortalTheme: vi.fn(),
    portalHostPortalUrl: null, portalAgency: null
  };
  return { branding, agency: { setCurrentAgency: vi.fn() }, resolve: () => resolve() };
}
describe('startup branding', () => {
  it('lets the app mount while both branding requests are pending', () => {
    const f = fixture();
    expect(startStartupBranding(f.branding, f.agency, '/login', () => '/login')).toBeUndefined();
    expect(f.branding.initializePortalTheme).toHaveBeenCalledOnce();
    expect(f.branding.fetchPlatformBranding).toHaveBeenCalledOnce();
    expect(f.branding.clearPortalTheme).not.toHaveBeenCalled();
    expect(f.agency.setCurrentAgency).toHaveBeenCalledWith(null);
  });
  it('preserves a dedicated host theme after a slow resolution', async () => {
    const f = fixture(); startStartupBranding(f.branding, f.agency, '/login', () => '/login');
    f.branding.portalHostPortalUrl = 'itsco'; f.resolve(); await Promise.resolve();
    expect(f.branding.clearPortalTheme).not.toHaveBeenCalled();
  });
  it('clears platform login styling only after host resolution finishes', async () => {
    const f = fixture(); startStartupBranding(f.branding, f.agency, '/login', () => '/login');
    f.resolve(); await Promise.resolve(); expect(f.branding.clearPortalTheme).toHaveBeenCalledOnce();
  });
  it('preserves slug login fallback and does not change a screen navigated away from', async () => {
    const f = fixture(); startStartupBranding(f.branding, f.agency, '/itsco/school/login', () => '/itsco/school/login');
    f.resolve(); await Promise.resolve(); expect(f.branding.fetchAgencyTheme).toHaveBeenCalledWith('school');
    const other = fixture(); startStartupBranding(other.branding, other.agency, '/login', () => '/itsco/dashboard');
    other.resolve(); await Promise.resolve(); expect(other.branding.clearPortalTheme).not.toHaveBeenCalled();
  });
});
