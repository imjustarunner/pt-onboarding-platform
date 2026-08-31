-- Migration 1351: Inner Strength (TISI) app host + medical billing
-- Dedicated host mirrors ITSCO/NLU so brand-switch leaves app.itsco.health.
-- medicalBillingEnabled unlocks Note Aid chart / claims for TISI clients.

UPDATE agencies
SET custom_domain = 'app.theinnerstrengthinstitute.com',
    feature_flags = JSON_SET(
      COALESCE(feature_flags, JSON_OBJECT()),
      '$.medicalBillingEnabled',
      CAST('true' AS JSON)
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(is_archived, 0) = 0
  AND (
    LOWER(COALESCE(slug, '')) IN (
      'tisi',
      'inner-strength',
      'innerstrength',
      'theinnerstrengthinstitute',
      'the-inner-strength-institute'
    )
    OR LOWER(COALESCE(portal_url, '')) IN (
      'tisi',
      'inner-strength',
      'innerstrength',
      'theinnerstrengthinstitute',
      'the-inner-strength-institute'
    )
    OR LOWER(COALESCE(name, '')) LIKE '%inner strength%'
  );

INSERT IGNORE INTO agency_custom_domains (agency_id, hostname, is_active)
SELECT id, 'app.theinnerstrengthinstitute.com', TRUE
FROM agencies
WHERE COALESCE(is_archived, 0) = 0
  AND (
    LOWER(COALESCE(slug, '')) IN (
      'tisi',
      'inner-strength',
      'innerstrength',
      'theinnerstrengthinstitute',
      'the-inner-strength-institute'
    )
    OR LOWER(COALESCE(portal_url, '')) IN (
      'tisi',
      'inner-strength',
      'innerstrength',
      'theinnerstrengthinstitute',
      'the-inner-strength-institute'
    )
    OR LOWER(COALESCE(name, '')) LIKE '%inner strength%'
  )
LIMIT 1;
