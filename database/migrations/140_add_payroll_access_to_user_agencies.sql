-- Migration: Add payroll access flag to user_agencies
-- Description: Allow per-agency payroll management access for non-admin staff.

ALTER TABLE user_agencies
  ADD COLUMN has_payroll_access TINYINT(1) NOT NULL DEFAULT 0 AFTER created_at;

CREATE INDEX idx_user_agencies_payroll_access
  ON user_agencies (agency_id, has_payroll_access, user_id);

