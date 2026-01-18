-- Migration: Payroll import row fingerprint + draft payable toggle
-- Description: Add non-PHI row identifiers and draft payable flag for row-level payroll auditing.

ALTER TABLE payroll_import_rows
  ADD COLUMN service_date DATE NULL AFTER service_code,
  ADD COLUMN row_fingerprint CHAR(64) NULL AFTER service_date,
  ADD COLUMN draft_payable TINYINT(1) NOT NULL DEFAULT 1 AFTER paid_status;

CREATE INDEX idx_payroll_rows_period_date_code
  ON payroll_import_rows (payroll_period_id, service_date, service_code);

CREATE INDEX idx_payroll_rows_period_draft_payable
  ON payroll_import_rows (payroll_period_id, note_status, draft_payable);

