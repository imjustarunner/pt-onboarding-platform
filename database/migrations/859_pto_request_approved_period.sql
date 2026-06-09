-- Migration 859: Track which pay period a PTO request was approved into
ALTER TABLE payroll_pto_requests
  ADD COLUMN approved_payroll_period_id BIGINT UNSIGNED NULL DEFAULT NULL
    COMMENT 'The payroll period the PTO was posted to at approval time (first/primary period).';
