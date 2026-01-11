-- Migration: Add platform organization fields to platform_branding table
-- Description: Add organization_name and organization_logo_icon_id for platform branding on login pages

ALTER TABLE platform_branding
  ADD COLUMN organization_name VARCHAR(255) NULL COMMENT 'Platform organization name (e.g., PlotTwistCo)',
  ADD COLUMN organization_logo_icon_id INT NULL COMMENT 'Platform organization logo icon',
  ADD FOREIGN KEY (organization_logo_icon_id) REFERENCES icons(id) ON DELETE SET NULL;
