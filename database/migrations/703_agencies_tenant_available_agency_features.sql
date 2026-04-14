-- Per-tenant overrides for which Company Profile feature toggles are visible.
-- Keys match agency feature_flags / platform available_agency_features_json.
-- When a key is absent here, platform_branding.available_agency_features_json applies.
-- Explicit true/false on a key overrides the platform default for that agency only.

ALTER TABLE agencies
  ADD COLUMN tenant_available_agency_features_json JSON NULL
  COMMENT 'Per-tenant override of platform feature visibility (NULL = inherit all keys from platform_branding)';
