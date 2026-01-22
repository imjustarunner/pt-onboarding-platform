-- Migration: Extend payroll import row fingerprint length
-- Description: row_fingerprint is a stable hashed identifier (versioned prefix + sha256).
--              Increase column width to avoid truncation errors when including a prefix.

ALTER TABLE payroll_import_rows
  MODIFY COLUMN row_fingerprint VARCHAR(80) NULL;

