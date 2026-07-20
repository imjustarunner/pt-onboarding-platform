-- Migration 1004: medical billing access flag (payroll-style gate for support/staff)
ALTER TABLE user_agencies
  ADD COLUMN has_billing_access TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, support/staff may manage medical billing for this agency';

CREATE INDEX idx_user_agencies_billing_access
  ON user_agencies (has_billing_access, agency_id);
