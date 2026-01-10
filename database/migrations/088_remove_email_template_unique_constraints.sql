-- Migration: Remove unique constraints from email_templates table
-- Description: Allow multiple templates of the same type for the same agency/platform
-- This enables users to create multiple versions of welcome emails and other templates

-- Drop the unique constraints that prevent multiple templates of the same type
-- Note: Using separate statements for better MySQL compatibility
ALTER TABLE email_templates DROP INDEX unique_agency_template;
ALTER TABLE email_templates DROP INDEX unique_platform_template;

-- Note: The indexes on type, agency_id, and platform_branding_id remain for query performance
