import { describe, expect, it } from 'vitest';
import { hubPathPrefix } from '../orgScopedPath.js';

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
