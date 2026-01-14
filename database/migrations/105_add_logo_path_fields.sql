-- Migration: Add logo_path fields for uploaded logos
-- Description: Add logo_path fields to support logo file uploads alongside existing logo_url fields
-- This allows users to choose between uploading a logo file or providing a URL

-- Add logo_path to agencies table
ALTER TABLE agencies
  ADD COLUMN logo_path VARCHAR(500) NULL COMMENT 'Path to uploaded logo file in GCS (uploads/logos/...)' AFTER logo_url;

-- Add organization_logo_path to platform_branding table
ALTER TABLE platform_branding
  ADD COLUMN organization_logo_path VARCHAR(500) NULL COMMENT 'Path to uploaded platform logo file in GCS (uploads/logos/...)' AFTER organization_logo_url;
