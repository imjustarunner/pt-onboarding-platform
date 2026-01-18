-- Migration: Agency tier system settings
-- Description: Tier system is agency-specific and can be enabled/disabled; thresholds are configurable.

ALTER TABLE agencies
  ADD COLUMN tier_system_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER organization_type,
  ADD COLUMN tier_thresholds_json JSON NULL AFTER tier_system_enabled;

