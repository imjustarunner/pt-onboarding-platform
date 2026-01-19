-- Migration: Add fingerprint to payroll rate templates
-- Description: Enables de-duplication of pay matrices by a stable signature.

ALTER TABLE payroll_rate_templates
  ADD COLUMN fingerprint VARCHAR(64) NULL AFTER name,
  ADD UNIQUE KEY uniq_rate_template_fingerprint (agency_id, fingerprint);

