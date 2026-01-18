-- Migration: Payroll period run history snapshots
-- Description: Store snapshots per Run Payroll so we can detect late-note conversions in prior periods.

CREATE TABLE IF NOT EXISTS payroll_period_runs (
  id INT NOT NULL AUTO_INCREMENT,
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  payroll_import_id INT NULL,
  ran_by_user_id INT NOT NULL,
  ran_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_import_id) REFERENCES payroll_imports(id) ON DELETE SET NULL,
  FOREIGN KEY (ran_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_runs_period (payroll_period_id),
  INDEX idx_runs_agency (agency_id),
  INDEX idx_runs_ran_at (ran_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_period_run_rows (
  payroll_period_run_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  service_code VARCHAR(64) NOT NULL,
  no_note_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  draft_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  finalized_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (payroll_period_run_id, user_id, service_code),
  FOREIGN KEY (payroll_period_run_id) REFERENCES payroll_period_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_run_rows_period (payroll_period_id),
  INDEX idx_run_rows_user (user_id),
  INDEX idx_run_rows_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

