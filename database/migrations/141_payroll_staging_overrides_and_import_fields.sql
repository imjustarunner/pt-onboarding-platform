-- Migration: Payroll staging overrides + import fields
-- Description: Store normalized note status fields for import rows and persist editable staging overrides.

ALTER TABLE payroll_import_rows
  ADD COLUMN note_status VARCHAR(32) NULL AFTER service_code,
  ADD COLUMN appt_type VARCHAR(255) NULL AFTER note_status,
  ADD COLUMN amount_collected DECIMAL(12,2) NULL AFTER appt_type,
  ADD COLUMN paid_status VARCHAR(64) NULL AFTER amount_collected;

CREATE INDEX idx_payroll_rows_period_status
  ON payroll_import_rows (payroll_period_id, note_status);

CREATE TABLE IF NOT EXISTS payroll_staging_overrides (
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  service_code VARCHAR(64) NOT NULL,
  no_note_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  draft_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  finalized_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (payroll_period_id, user_id, service_code),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_staging_agency (agency_id),
  INDEX idx_staging_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

