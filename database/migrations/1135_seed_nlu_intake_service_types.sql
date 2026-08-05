-- Migration 1135: seed public intake service types for multi-service NLU tenants
-- Inner Strength and other single-service clinical agencies keep counseling-only fallback in app code.

INSERT INTO agency_public_service_types
  (agency_id, service_type, display_name, intro_blurb, is_enabled, sort_order)
SELECT
  a.id,
  'counseling',
  'Counseling',
  'Start an intake for counseling and behavioral health services.',
  1,
  0
FROM agencies a
WHERE (
    LOWER(COALESCE(a.slug, '')) LIKE '%nlu%'
    OR LOWER(COALESCE(a.portal_url, '')) LIKE '%nlu%'
    OR LOWER(COALESCE(a.name, '')) LIKE '%new life%'
    OR LOWER(COALESCE(a.name, '')) LIKE '%newlife%'
  )
  AND COALESCE(a.is_archived, 0) = 0
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  intro_blurb = VALUES(intro_blurb),
  is_enabled = 1,
  sort_order = LEAST(sort_order, VALUES(sort_order));

INSERT INTO agency_public_service_types
  (agency_id, service_type, display_name, intro_blurb, is_enabled, sort_order)
SELECT
  a.id,
  'tutoring',
  'Tutoring',
  'Start an intake for tutoring and academic support.',
  1,
  1
FROM agencies a
WHERE (
    LOWER(COALESCE(a.slug, '')) LIKE '%nlu%'
    OR LOWER(COALESCE(a.portal_url, '')) LIKE '%nlu%'
    OR LOWER(COALESCE(a.name, '')) LIKE '%new life%'
    OR LOWER(COALESCE(a.name, '')) LIKE '%newlife%'
  )
  AND COALESCE(a.is_archived, 0) = 0
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  intro_blurb = VALUES(intro_blurb),
  is_enabled = 1,
  sort_order = VALUES(sort_order);
