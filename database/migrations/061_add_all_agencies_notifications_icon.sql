-- Migration: Add all agencies notifications icon to platform_branding
-- Description: Add icon field for the "All Agencies" notification card

-- Add all_agencies_notifications_icon_id to platform_branding
ALTER TABLE platform_branding
ADD COLUMN all_agencies_notifications_icon_id INT NULL;

-- Add foreign key constraint
ALTER TABLE platform_branding
ADD CONSTRAINT fk_platform_all_agencies_notifications_icon 
FOREIGN KEY (all_agencies_notifications_icon_id) REFERENCES icons(id) ON DELETE SET NULL;
