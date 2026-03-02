-- Migration: Add platform-level control for which agency feature toggles are visible
-- Description: SuperAdmin can enable/disable which features agencies can toggle in Company Profile.
-- When a feature is not available, agencies will not see that toggle at all.

-- Add platform-level control for which agency feature toggles are visible.
-- SuperAdmin can enable/disable which features agencies can toggle in Company Profile.
-- When a feature is not available, agencies will not see that toggle at all.

ALTER TABLE platform_branding
  ADD COLUMN available_agency_features_json JSON NULL
  COMMENT 'Keys match agency feature_flags. When false or missing, that toggle is hidden from agencies.';
