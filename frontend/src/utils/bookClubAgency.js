/**
 * Book Club affiliations share organization_type=affiliation with SSTC clubs.
 * Prefer agencies.club_kind = 'book_club'; fall back to slug/name heuristics.
 */
export function isBookClubAgency(agency) {
  if (!agency || typeof agency !== 'object') return false;
  const kind = String(agency.club_kind || agency.clubKind || '')
    .trim()
    .toLowerCase();
  if (kind === 'book_club') return true;
  const slug = String(agency.slug || agency.portal_url || agency.portalUrl || '')
    .trim()
    .toLowerCase();
  if (slug.includes('book-club') || slug.includes('book_club') || slug === 'bookclub') {
    return true;
  }
  const name = String(agency.name || '').trim().toLowerCase();
  return name.includes('book club');
}
