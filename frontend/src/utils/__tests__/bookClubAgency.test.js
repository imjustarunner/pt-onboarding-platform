import { describe, it, expect } from 'vitest';
import { isBookClubAgency, getBookClubParentSlug, resolveWorkTenantSlug } from '../bookClubAgency.js';

describe('isBookClubAgency', () => {
  it('detects club_kind', () => {
    expect(isBookClubAgency({ club_kind: 'book_club', organization_type: 'affiliation' })).toBe(true);
  });

  it('detects slug heuristics', () => {
    expect(isBookClubAgency({ slug: 'may-book-club', organization_type: 'affiliation' })).toBe(true);
  });

  it('does not treat SSTC affiliations as book clubs', () => {
    expect(
      isBookClubAgency({
        club_kind: null,
        slug: 'runners-club',
        name: 'Runners Club',
        organization_type: 'affiliation'
      })
    ).toBe(false);
  });
});

describe('book club tenant slug helpers', () => {
  it('returns parent slug for nested book club rows', () => {
    const bookClub = {
      club_kind: 'book_club',
      slug: 'itsco-book-club',
      parent_slug: 'itsco',
      organization_type: 'affiliation'
    };
    expect(getBookClubParentSlug(bookClub)).toBe('itsco');
    expect(resolveWorkTenantSlug(bookClub)).toBe('itsco');
  });

  it('passes through non-book-club org slugs', () => {
    const tenant = { slug: 'itsco', organization_type: 'agency' };
    expect(resolveWorkTenantSlug(tenant)).toBe('itsco');
  });
});
