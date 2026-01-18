-- Migration: Expand payroll period lifecycle (raw→stage→run→post)
-- Description: Add run/post metadata fields and extend payroll_periods.status enum.

-- Expand status enum to support lifecycle.
-- Keep legacy values ('draft','finalized') for backward compatibility.
ALTER TABLE payroll_periods
  MODIFY COLUMN status ENUM('draft','raw_imported','staged','ran','posted','finalized')
  NOT NULL DEFAULT 'draft';

-- Add run/post tracking metadata.
ALTER TABLE payroll_periods
  ADD COLUMN ran_at TIMESTAMP NULL AFTER finalized_at,
  ADD COLUMN ran_by_user_id INT NULL AFTER ran_at,
  ADD COLUMN posted_at TIMESTAMP NULL AFTER ran_by_user_id,
  ADD COLUMN posted_by_user_id INT NULL AFTER posted_at;

ALTER TABLE payroll_periods
  ADD CONSTRAINT fk_payroll_periods_ran_by_user
    FOREIGN KEY (ran_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_payroll_periods_posted_by_user
    FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_payroll_period_ran_by
  ON payroll_periods (ran_by_user_id);

CREATE INDEX idx_payroll_period_posted_by
  ON payroll_periods (posted_by_user_id);

CREATE INDEX idx_payroll_period_status
  ON payroll_periods (status);

