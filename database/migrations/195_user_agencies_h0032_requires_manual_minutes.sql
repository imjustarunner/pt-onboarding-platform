-- Migration: Add per-user toggle for H0032 manual minutes
-- Description: Category-2 providers require payroll processing to enter accurate minutes for H0032.

ALTER TABLE user_agencies
  ADD COLUMN h0032_requires_manual_minutes TINYINT(1) NOT NULL DEFAULT 0 AFTER has_payroll_access;

CREATE INDEX idx_user_agencies_h0032_manual_minutes
  ON user_agencies (agency_id, h0032_requires_manual_minutes, user_id);

