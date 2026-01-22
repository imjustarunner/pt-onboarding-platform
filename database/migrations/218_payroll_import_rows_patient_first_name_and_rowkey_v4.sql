-- Migration: Payroll import rows store patient first name + deterministic v4 row key
-- Description:
-- - Add patient_first_name (from billing report "First Name") for deterministic tracking.
-- - Widen row_fingerprint to store a full v4 natural key string (not a hash).

ALTER TABLE payroll_import_rows
  ADD COLUMN patient_first_name VARCHAR(128) NULL AFTER provider_name,
  MODIFY COLUMN row_fingerprint VARCHAR(255) NULL;

