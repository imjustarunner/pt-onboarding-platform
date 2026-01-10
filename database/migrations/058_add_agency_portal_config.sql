-- Migration: Add agency portal configuration fields
-- Description: Add fields for agency portal configuration including onboarding team contact info, portal URL, and theme settings

ALTER TABLE agencies
  ADD COLUMN onboarding_team_email VARCHAR(255) NULL COMMENT 'Email address for the onboarding team',
  ADD COLUMN phone_number VARCHAR(20) NULL COMMENT 'Phone number for the agency',
  ADD COLUMN phone_extension VARCHAR(10) NULL COMMENT 'Phone extension (optional)',
  ADD COLUMN portal_url VARCHAR(255) NULL COMMENT 'Subdomain/URL identifier for portal access (e.g., "itsco", "nextleveluplcc")',
  ADD COLUMN theme_settings JSON NULL COMMENT 'Extended theme configuration (fonts, login background, etc.)';

-- Add unique index on portal_url to prevent conflicts
CREATE UNIQUE INDEX idx_portal_url ON agencies(portal_url);

-- Add index for faster lookups
CREATE INDEX idx_agencies_portal_url ON agencies(portal_url);

