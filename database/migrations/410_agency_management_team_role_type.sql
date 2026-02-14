-- Add role_type to agency_management_team for role-based grouping
-- credentialing, billing, support, account_manager

ALTER TABLE agency_management_team
  ADD COLUMN role_type VARCHAR(40) NULL COMMENT 'credentialing, billing, support, account_manager' AFTER display_role,
  ADD INDEX idx_amt_role_type (role_type);
