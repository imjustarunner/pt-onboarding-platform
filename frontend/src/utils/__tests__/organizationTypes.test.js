import { describe, expect, it } from 'vitest';
import {
  isPortalShellOrgType,
  orgMatchesSlug,
  resolveOrganizationTypeForSlug
} from '../organizationTypes.js';

describe('portal shell org types', () => {
  it('treats school/program/learning as portal shells', () => {
    expect(isPortalShellOrgType('school')).toBe(true);
    expect(isPortalShellOrgType({ organization_type: 'program' })).toBe(true);
    expect(isPortalShellOrgType({ organizationType: 'learning' })).toBe(true);
    expect(isPortalShellOrgType('agency')).toBe(false);
    expect(isPortalShellOrgType({ organization_type: 'agency' })).toBe(false);
  });
});

describe('resolveOrganizationTypeForSlug', () => {
  const school = {
    slug: 'colorado-springs-school-of-technology',
    portal_url: 'colorado-springs-school-of-technology',
    organization_type: 'school'
  };
  const tenant = { slug: 'itsco', portalUrl: 'itsco', organizationType: 'agency' };

  it('does not use a parent tenant type for a school slug', () => {
    expect(
      resolveOrganizationTypeForSlug({
        slug: 'colorado-springs-school-of-technology',
        context: tenant,
        currentOrganization: tenant,
        memberships: [tenant, school]
      })
    ).toBe('school');
  });

  it('returns null instead of agency when context is a different org', () => {
    expect(
      resolveOrganizationTypeForSlug({
        slug: 'colorado-springs-school-of-technology',
        context: tenant,
        currentOrganization: tenant,
        memberships: [tenant]
      })
    ).toBe(null);
  });

  it('matches portalUrl on organization context', () => {
    expect(
      orgMatchesSlug(
        { slug: 'csst', portalUrl: 'colorado-springs-school-of-technology', organizationType: 'school' },
        'colorado-springs-school-of-technology'
      )
    ).toBe(true);
  });
});
