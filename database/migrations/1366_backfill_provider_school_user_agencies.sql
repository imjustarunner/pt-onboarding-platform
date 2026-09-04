-- Migration 1366: Ensure providers with active school schedule assignments
-- also have user_agencies membership for that school (portal Providers list + access).

INSERT INTO user_agencies (user_id, agency_id, is_active)
SELECT DISTINCT psa.provider_user_id, psa.school_organization_id, 1
FROM provider_school_assignments psa
JOIN users u ON u.id = psa.provider_user_id
LEFT JOIN user_agencies ua
  ON ua.user_id = psa.provider_user_id
 AND ua.agency_id = psa.school_organization_id
WHERE psa.is_active = TRUE
  AND (u.is_archived IS NULL OR u.is_archived = FALSE)
  AND ua.user_id IS NULL
ON DUPLICATE KEY UPDATE is_active = VALUES(is_active);
