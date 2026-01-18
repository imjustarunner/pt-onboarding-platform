-- Migration: Payroll stage carryovers (Old Done Notes)
-- Description: Store carryover finalized units derived from decreases in prior period no-note/draft unpaid.

CREATE TABLE IF NOT EXISTS payroll_stage_carryovers (
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  service_code VARCHAR(64) NOT NULL,
  carryover_finalized_units DECIMAL(12,2) NOT NULL DEFAULT 0,
  source_payroll_period_id INT NULL,
  computed_by_user_id INT NOT NULL,
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payroll_period_id, user_id, service_code),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (source_payroll_period_id) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (computed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_carryovers_agency (agency_id),
  INDEX idx_carryovers_user (user_id),
  INDEX idx_carryovers_source (source_payroll_period_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

