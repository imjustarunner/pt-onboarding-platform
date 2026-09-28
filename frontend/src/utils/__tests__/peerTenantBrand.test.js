import { describe, expect, it } from 'vitest';
import { isMessagingTenant, membershipsForHover, resolvePeerTenantBrand } from '../peerTenantBrand';

const itsco = { id: 1, name: 'ITSCO', slug: 'itsco', organization_type: 'agency', icon_file_path: '/platform.svg', primary_color: '#0f172a' };
const club = { id: 2, name: 'ITSCO Book Club', organization_type: 'affiliation' };
describe('staff messaging tenant identity', () => {
  it('excludes clubs, programs, and schools from root tenant options', () => {
    expect(isMessagingTenant(itsco)).toBe(true);
    expect(isMessagingTenant(club)).toBe(false);
    expect(isMessagingTenant({ organization_type: 'clubwebapp' })).toBe(false);
    expect(isMessagingTenant({ organization_type: 'school' })).toBe(false);
  });
  it('uses ITSCO assets and palette even with inherited platform defaults', () => {
    const brand = resolvePeerTenantBrand({ shared_agency_memberships: [itsco, club] }, { defaultLogoUrl: '/platform.svg' });
    expect(brand.name).toBe('ITSCO');
    expect(brand.primaryColor).toBe('#086653');
    expect(brand.logoUrl).not.toContain('platform');
    expect(brand.memberships).toEqual([itsco]);
  });
  it('never substitutes the viewer affiliations for a peer with no shared tenants', () => {
    expect(membershipsForHover({ shared_agency_memberships: [club] }, [itsco, club])).toEqual([]);
    expect(membershipsForHover({ shared_agency_memberships: [] }, [itsco])).toEqual([]);
    expect(membershipsForHover({}, [itsco, club])).toHaveLength(1);
  });
});
