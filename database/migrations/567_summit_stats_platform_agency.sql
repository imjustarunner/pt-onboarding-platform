-- Summit Stats Team Challenge: Ensure platform agency exists for club affiliations
-- Clubs (affiliations) are linked to this platform agency via organization_affiliations.
-- getPlatformAgencyId() looks up by SUMMIT_STATS_PLATFORM_SLUG (default: ssc) or SUMMIT_STATS_PLATFORM_AGENCY_ID.
-- slug = 'ssc' is the canonical identifier for /ssc/* routes.

INSERT INTO agencies (name, slug, organization_type, is_active, portal_url)
SELECT 'Summit Stats', 'ssc', 'agency', 1, 'ssc'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM agencies WHERE slug = 'ssc');
