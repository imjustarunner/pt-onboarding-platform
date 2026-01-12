-- Migration: Add organization_logo_url column to platform_branding table
-- Description: Add organization_logo_url for platform branding logo (separate from icon library)

ALTER TABLE platform_branding
  ADD COLUMN organization_logo_url VARCHAR(500) NULL COMMENT 'Platform organization logo URL (full URL to logo image)';
