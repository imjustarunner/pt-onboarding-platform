-- Migration: Add package_type field to onboarding_packages
-- Description: Add package_type ENUM to categorize packages and trigger status changes

-- Add package_type column to onboarding_packages table
ALTER TABLE onboarding_packages
ADD COLUMN package_type ENUM('pre_hire', 'onboarding', 'training', 'other') NOT NULL DEFAULT 'onboarding' COMMENT 'Type of package: pre_hire, onboarding, training, or other';

-- Add index on package_type for efficient filtering
CREATE INDEX idx_package_type ON onboarding_packages(package_type);

-- Set default package_type for existing packages
-- Most existing packages are likely onboarding packages
UPDATE onboarding_packages 
SET package_type = 'onboarding' 
WHERE package_type IS NULL OR package_type = '';
