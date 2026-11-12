-- Owner-authorized 2026-11-12: CAPTCHA-only configuration for the retained
-- fictional SchoolCareBridge company. This does not enable qaSandbox or change
-- authentication, authorization, memberships, submission limits or real tenants.
-- The normal deployment runner records this migration in migrations_log.
UPDATE agencies
SET feature_flags = JSON_SET(
  CASE WHEN JSON_VALID(feature_flags) THEN feature_flags ELSE JSON_OBJECT() END,
  '$.qaCaptcha',
  JSON_SET(
    COALESCE(JSON_EXTRACT(CASE WHEN JSON_VALID(feature_flags) THEN feature_flags ELSE JSON_OBJECT() END, '$.qaCaptcha'), JSON_OBJECT()),
    '$.syntheticOnly', CAST('true' AS JSON)
  )
)
WHERE id = 456
  AND slug = 'scb-qa-company'
  AND organization_type = 'agency'
  AND is_active = 1
  AND COALESCE(is_archived, 0) = 0
  AND (feature_flags IS NULL OR feature_flags = '' OR JSON_VALID(feature_flags))
  AND (feature_flags IS NULL OR feature_flags = '' OR JSON_TYPE(CASE WHEN JSON_VALID(feature_flags) THEN feature_flags ELSE JSON_OBJECT() END) = 'OBJECT')
  AND (JSON_EXTRACT(CASE WHEN JSON_VALID(feature_flags) THEN feature_flags ELSE JSON_OBJECT() END, '$.qaCaptcha') IS NULL
       OR JSON_TYPE(JSON_EXTRACT(CASE WHEN JSON_VALID(feature_flags) THEN feature_flags ELSE JSON_OBJECT() END, '$.qaCaptcha')) = 'OBJECT');
