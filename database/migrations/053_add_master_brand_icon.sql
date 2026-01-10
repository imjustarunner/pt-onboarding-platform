-- Migration: Add master brand icon to platform branding
-- Description: Add master_brand_icon_id field for use as the logo when viewing all agencies

-- Add master_brand_icon_id column to platform_branding
ALTER TABLE platform_branding
ADD COLUMN master_brand_icon_id INT NULL AFTER document_default_icon_id,
ADD CONSTRAINT fk_platform_master_brand_icon FOREIGN KEY (master_brand_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

