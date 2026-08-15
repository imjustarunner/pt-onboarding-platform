import { describe, expect, it } from 'vitest';
import { hubPathPrefix, resolvePortalSlugFromPath } from '../orgScopedPath.js';

describe('hubPathPrefix', () => {
  it('stays flat on a dedicated app host even when another agency is selected', () => {
    expect(hubPathPrefix({
      routeSlug: '',
      agency: { slug: 'burning-sage', portal_url: 'burning-sage' },
      branding: { portalHostPortalUrl: 'itsco' }
    })).toBe('');
  });

  it('prefixes the route slug when touring another tenant on a dedicated host', () => {
    expect(hubPathPrefix({
      routeSlug: 'burning-sage',
      agency: { slug: 'burning-sage' },
      branding: { portalHostPortalUrl: 'itsco' }
    })).toBe('/burning-sage');
  });

  it('uses the current agency slug on the platform host', () => {
    expect(hubPathPrefix({
      routeSlug: '',
      agency: { slug: 'itsco', portal_url: 'itsco' },
      branding: { portalHostPortalUrl: '' }
    })).toBe('/itsco');
  });
});

describe('resolvePortalSlugFromPath', () => {
  it('reads the agency from /join/:slug/counseling instead of treating join as the tenant', () => {
    expect(resolvePortalSlugFromPath('/join/itsco/counseling')).toBe('itsco');
    expect(resolvePortalSlugFromPath('/join/itsco')).toBe('itsco');
  });

  it('reads a scoped org join path', () => {
    expect(resolvePortalSlugFromPath('/itsco/join/counseling')).toBe('itsco');
  });

  it('ignores reserved first segments', () => {
    expect(resolvePortalSlugFromPath('/admin/settings')).toBe('');
    expect(resolvePortalSlugFromPath('/intake/abc')).toBe('');
  });
});
