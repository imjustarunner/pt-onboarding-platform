-- Migration: Add School Overview quick-action icon overrides
-- Adds platform- and agency-level icon override IDs for the School Overview dashboard action.

ALTER TABLE agencies
  ADD COLUMN school_overview_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD COLUMN school_overview_icon_id INT NULL;

