-- Migration: Payroll period run snapshots
-- Description: Row-level snapshots per run for reliable carryover tracking.
--              Replaces brittle fingerprint-based matching with deterministic row_match_key (SHA256).
--              Encrypted payload stores identity data for audit/display.

CREATE TABLE IF NOT EXISTS payroll_period_run_snapshots (
  id INT NOT NULL AUTO_INCREMENT,
  payroll_period_run_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  row_match_key VARCHAR(64) NOT NULL,
  user_id INT NOT NULL DEFAULT 0,
  service_code VARCHAR(64) NOT NULL,
  service_date DATE NULL,
  no_note_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  draft_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  finalized_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  payload_ciphertext_b64 LONGTEXT NULL,
  payload_iv_b64 VARCHAR(128) NULL,
  payload_auth_tag_b64 VARCHAR(128) NULL,
  payload_key_id VARCHAR(32) NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (payroll_period_run_id) REFERENCES payroll_period_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_snapshots_run (payroll_period_run_id),
  INDEX idx_snapshots_period (payroll_period_id),
  INDEX idx_snapshots_agency (agency_id),
  INDEX idx_snapshots_match_key (row_match_key),
  INDEX idx_snapshots_run_match (payroll_period_run_id, row_match_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
