-- Migration 906: seed coaching/consulting public service types for practitioner tenants
-- agency_public_service_types.service_type is VARCHAR(32) so no ENUM change is required.
-- Default-enable public booking surface for life_coach / consultant roots.

UPDATE agencies
SET public_availability_enabled = TRUE
WHERE LOWER(COALESCE(organization_type, '')) IN ('life_coach', 'consultant')
  AND COALESCE(is_archived, 0) = 0;

-- Coaching for life_coach tenants
INSERT INTO agency_public_service_types
  (agency_id, service_type, display_name, intro_blurb, is_enabled, sort_order)
SELECT
  a.id,
  'coaching',
  'Life Coaching',
  'Book a discovery session with your coach. Share a bit about your goals and pick a time that works.',
  1,
  0
FROM agencies a
WHERE LOWER(COALESCE(a.organization_type, '')) = 'life_coach'
  AND COALESCE(a.is_archived, 0) = 0
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  intro_blurb = VALUES(intro_blurb),
  is_enabled = 1;

-- Consulting for consultant tenants
INSERT INTO agency_public_service_types
  (agency_id, service_type, display_name, intro_blurb, is_enabled, sort_order)
SELECT
  a.id,
  'consulting',
  'Consulting',
  'Request a discovery call with your consultant. Tell us what you need help with and choose a time.',
  1,
  0
FROM agencies a
WHERE LOWER(COALESCE(a.organization_type, '')) = 'consultant'
  AND COALESCE(a.is_archived, 0) = 0
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  intro_blurb = VALUES(intro_blurb),
  is_enabled = 1;

-- Best-effort: enroll active staff/providers already on the tenant into the matching service type
INSERT INTO provider_public_service_enrollments
  (agency_id, user_id, service_type, is_active)
SELECT
  ua.agency_id,
  ua.user_id,
  CASE
    WHEN LOWER(COALESCE(a.organization_type, '')) = 'life_coach' THEN 'coaching'
    ELSE 'consulting'
  END,
  1
FROM user_agencies ua
INNER JOIN agencies a ON a.id = ua.agency_id
INNER JOIN users u ON u.id = ua.user_id
WHERE LOWER(COALESCE(a.organization_type, '')) IN ('life_coach', 'consultant')
  AND COALESCE(a.is_archived, 0) = 0
  AND UPPER(COALESCE(u.status, '')) = 'ACTIVE_EMPLOYEE'
  AND LOWER(COALESCE(u.role, '')) IN ('admin', 'provider', 'provider_plus', 'super_admin', 'staff')
ON DUPLICATE KEY UPDATE is_active = 1;
