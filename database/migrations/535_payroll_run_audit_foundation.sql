-- Migration: Payroll run audit foundation
-- Description:
--   1) Adds explicit run numbering per payroll period.
--   2) Adds row-level payroll import row audit history.
--   3) Adds persisted run-to-run delta records for replay/auditing.

-- NOTE: migration runner executes statements using prepared protocol, so avoid PREPARE/EXECUTE here.
-- Add run_number to payroll_period_runs.
ALTER TABLE payroll_period_runs
  ADD COLUMN run_number INT NULL AFTER payroll_import_id;

-- Backfill run_number deterministically by (ran_at, id) within each payroll period.
SET @prev_period := NULL;
SET @seq := 0;
UPDATE payroll_period_runs r
JOIN (
  SELECT
    id,
    payroll_period_id,
    (@seq := IF(@prev_period = payroll_period_id, @seq + 1, 1)) AS seq,
    (@prev_period := payroll_period_id) AS _period_marker
  FROM payroll_period_runs
  ORDER BY payroll_period_id ASC, ran_at ASC, id ASC
) ordered ON ordered.id = r.id
SET r.run_number = ordered.seq
WHERE r.run_number IS NULL OR r.run_number <= 0;

-- Make run_number required now that backfill is done.
ALTER TABLE payroll_period_runs
  MODIFY COLUMN run_number INT NOT NULL;

-- Ensure run number is unique per pay period and index for querying.
ALTER TABLE payroll_period_runs
  ADD UNIQUE KEY uniq_payroll_period_run_number (payroll_period_id, run_number);

ALTER TABLE payroll_period_runs
  ADD INDEX idx_runs_period_number (payroll_period_id, run_number);

-- Row-level audit history for payroll_import_rows edits.
CREATE TABLE IF NOT EXISTS payroll_import_row_audit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  payroll_import_row_id INT NOT NULL,
  payroll_import_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  field_changed VARCHAR(64) NOT NULL,
  from_value TEXT NULL,
  to_value TEXT NULL,
  changed_by_user_id INT NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (payroll_import_row_id) REFERENCES payroll_import_rows(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_import_id) REFERENCES payroll_imports(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_pira_row (payroll_import_row_id),
  INDEX idx_pira_period (payroll_period_id),
  INDEX idx_pira_field (field_changed),
  INDEX idx_pira_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Persisted run-to-run deltas used by Raw Import Audit.
CREATE TABLE IF NOT EXISTS payroll_run_deltas (
  id BIGINT NOT NULL AUTO_INCREMENT,
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  baseline_run_id INT NOT NULL,
  compare_run_id INT NOT NULL,
  row_match_key VARCHAR(255) NULL,
  delta_type ENUM('status_change','code_change','unit_change','added','removed') NOT NULL,
  from_status VARCHAR(64) NULL,
  to_status VARCHAR(64) NULL,
  from_service_code VARCHAR(64) NULL,
  to_service_code VARCHAR(64) NULL,
  from_units DECIMAL(12,2) NULL,
  to_units DECIMAL(12,2) NULL,
  paid_state VARCHAR(16) NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (baseline_run_id) REFERENCES payroll_period_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (compare_run_id) REFERENCES payroll_period_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_prd_period_runs (payroll_period_id, baseline_run_id, compare_run_id),
  INDEX idx_prd_type (delta_type),
  INDEX idx_prd_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
