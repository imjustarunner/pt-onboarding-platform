import { describe, expect, it } from 'vitest';
import { shouldApplyPortalAgencyThemeFirst } from '../portalThemePriority.js';

describe('shouldApplyPortalAgencyThemeFirst', () => {
  it('uses platform branding after an explicit platform selection on a tenant host', () => {
    expect(shouldApplyPortalAgencyThemeFirst({
      hasPortalAgency: true,
      isAuthenticated: true,
      platformMode: true,
      currentAgency: null,
      routeSlug: '',
      portalSlug: 'itsco',
      hostImpliedSlug: 'itsco'
    })).toBe(false);
  });

  it('uses the route slug when touring another tenant', () => {
    expect(shouldApplyPortalAgencyThemeFirst({
      hasPortalAgency: true,
      isAuthenticated: true,
      platformMode: false,
      currentAgency: { slug: 'burning-sage' },
      routeSlug: 'burning-sage',
      portalSlug: 'itsco',
      hostImpliedSlug: 'itsco'
    })).toBe(false);
  });

  it('lets platform branding win on the main platform host with no slug', () => {
    expect(shouldApplyPortalAgencyThemeFirst({
      hasPortalAgency: true,
      isAuthenticated: true,
      platformMode: true,
      currentAgency: null,
      routeSlug: '',
      portalSlug: 'itsco',
      hostImpliedSlug: ''
    })).toBe(false);
  });
});
