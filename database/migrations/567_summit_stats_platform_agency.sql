-- Summit Stats Challenge: Ensure platform agency exists for club affiliations
-- Clubs (affiliations) are linked to this platform agency via organization_affiliations.
-- getPlatformAgencyId() looks up by SUMMIT_STATS_PLATFORM_SLUG (default: summit-stats) or SUMMIT_STATS_PLATFORM_AGENCY_ID.

INSERT INTO agencies (name, slug, organization_type, is_active)
SELECT 'Summit Stats', 'summit-stats', 'agency', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM agencies WHERE slug = 'summit-stats');
