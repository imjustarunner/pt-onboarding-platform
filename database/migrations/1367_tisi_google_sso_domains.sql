-- Migration 1367: Enable Inner Strength (TISI) Google SSO for PlotTwist + Inner Strength domains
-- Allows staff with @plottwistco.com or Inner Strength email domains to SSO on TISI.

UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.googleSsoEnabled', true,
  '$.googleSsoAllowedDomains', JSON_ARRAY(
    'plottwistco.com',
    'theinnerstrengthinstitute.com',
    'innerstrengthin.com'
  ),
  '$.googleSsoRequiredRoles', JSON_ARRAY(
    'staff',
    'admin',
    'provider',
    'provider_plus',
    'clinical_practice_assistant',
    'supervisor',
    'support'
  )
)
WHERE LOWER(COALESCE(slug, '')) IN (
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
  'theinnerstrengthinstitute'
)
OR LOWER(COALESCE(custom_domain, '')) LIKE '%theinnerstrengthinstitute.com%';
