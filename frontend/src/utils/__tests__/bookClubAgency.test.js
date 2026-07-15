import { describe, it, expect } from 'vitest';
import { isBookClubAgency } from '../bookClubAgency.js';

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
