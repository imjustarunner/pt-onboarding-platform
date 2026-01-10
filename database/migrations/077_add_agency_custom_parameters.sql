-- Migration: Add custom_parameters field to agencies table
-- Description: Allow agencies to store custom parameters that can be used in email templates

ALTER TABLE agencies
  ADD COLUMN custom_parameters JSON NULL COMMENT 'Custom parameters for email templates (e.g., {"department_name": "HR", "office_location": "New York"})' AFTER theme_settings;

-- Add index for faster lookups (though JSON indexing is limited in MySQL)
-- Note: For complex queries, consider using generated columns
