-- Migration: Payroll import rows processing flags (H0031/H0032 gate)
-- Description: Add fields to require processor confirmation of minutes before payroll can be run.

ALTER TABLE payroll_import_rows
  ADD COLUMN requires_processing TINYINT(1) NOT NULL DEFAULT 0 AFTER row_fingerprint,
  ADD COLUMN processed_at DATETIME NULL AFTER requires_processing,
  ADD COLUMN processed_by_user_id INT NULL AFTER processed_at;

CREATE INDEX idx_payroll_rows_processing_queue
  ON payroll_import_rows (payroll_period_id, requires_processing, processed_at, service_code, service_date);

