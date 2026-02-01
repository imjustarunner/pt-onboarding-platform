-- Backfill parent-agency memberships for users assigned to child organizations.
--
-- Problem:
-- `user_agencies.agency_id` is used to store membership to many organization types (schools/programs/etc),
-- but payroll access is agency-scoped. Some users are only linked to child org ids, so agency-only checks fail.
--
-- Fix:
-- Ensure every user assigned to a child org also has a membership row for the parent agency.

-- Preferred mapping: organization_affiliations (generalized)
INSERT INTO user_agencies (user_id, agency_id)
SELECT ua.user_id, oa.agency_id
FROM user_agencies ua
JOIN agencies org ON org.id = ua.agency_id
JOIN organization_affiliations oa
  ON oa.organization_id = ua.agency_id
 AND oa.is_active = TRUE
LEFT JOIN user_agencies ua2
  ON ua2.user_id = ua.user_id
 AND ua2.agency_id = oa.agency_id
WHERE LOWER(COALESCE(org.organization_type, 'agency')) <> 'agency'
  AND ua2.user_id IS NULL;

-- Legacy mapping: agency_schools (schools only)
INSERT INTO user_agencies (user_id, agency_id)
SELECT ua.user_id, s.agency_id
FROM user_agencies ua
JOIN agencies org ON org.id = ua.agency_id
JOIN agency_schools s
  ON s.school_organization_id = ua.agency_id
 AND (s.is_active = TRUE OR s.is_active IS NULL)
LEFT JOIN user_agencies ua2
  ON ua2.user_id = ua.user_id
 AND ua2.agency_id = s.agency_id
WHERE LOWER(COALESCE(org.organization_type, 'agency')) = 'school'
  AND ua2.user_id IS NULL;

