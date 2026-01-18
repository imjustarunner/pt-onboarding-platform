-- Migration: Track who finalized payroll periods
-- Description: Adds finalized_by_user_id to payroll_periods for payroll history auditing.

ALTER TABLE payroll_periods
  ADD COLUMN finalized_by_user_id INT NULL AFTER finalized_at;

ALTER TABLE payroll_periods
  ADD CONSTRAINT fk_payroll_period_finalized_by
  FOREIGN KEY (finalized_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

CREATE INDEX idx_payroll_period_finalized_by
  ON payroll_periods (finalized_by_user_id);

