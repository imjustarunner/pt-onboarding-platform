-- Backfill user_agencies for providers who have provider_school_assignments but are not yet in user_agencies for the school.
-- This ensures School Portal "Providers" list shows providers who were added via Provider Scheduling.
-- Safe to run: uses INSERT IGNORE to avoid duplicates.

INSERT IGNORE INTO user_agencies (user_id, agency_id)
SELECT DISTINCT psa.provider_user_id, psa.school_organization_id
FROM provider_school_assignments psa
LEFT JOIN user_agencies ua
  ON ua.user_id = psa.provider_user_id
 AND ua.agency_id = psa.school_organization_id
WHERE psa.is_active = TRUE
  AND ua.user_id IS NULL;
