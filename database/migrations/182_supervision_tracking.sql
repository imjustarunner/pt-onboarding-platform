-- Migration: Supervision tracking (pre-licensed providers)
-- Agency-level feature + per-user totals + per-pay-period entries for imports.

-- Agency settings (agency orgs only; ignored for schools/programs)
ALTER TABLE agencies
  ADD COLUMN supervision_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN supervision_policy_json JSON NULL;

-- Per-user supervision totals (materialized for fast reads + notification gating)
CREATE TABLE IF NOT EXISTS supervision_accounts (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  individual_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  group_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  last_notified_individual_50_at TIMESTAMP NULL,
  last_notified_total_100_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_supervision_acct (agency_id, user_id),
  CONSTRAINT fk_supervision_acct_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervision_acct_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-pay-period imported hours (upsertable so re-uploads for same period/user replace)
CREATE TABLE IF NOT EXISTS supervision_period_entries (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  user_id INT NOT NULL,
  individual_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  group_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  source_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_supervision_period_user (agency_id, payroll_period_id, user_id),
  INDEX idx_supervision_period (agency_id, payroll_period_id),
  CONSTRAINT fk_supervision_period_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervision_period_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervision_period_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervision_period_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

