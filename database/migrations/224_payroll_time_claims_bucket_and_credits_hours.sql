-- Payroll: time claims direct/indirect bucket + optional hours/credits
-- Approved time claims roll into payroll totals; bucket controls direct vs indirect totals.

ALTER TABLE payroll_time_claims
  ADD COLUMN bucket ENUM('direct','indirect') NOT NULL DEFAULT 'indirect' AFTER target_payroll_period_id,
  ADD COLUMN credits_hours DECIMAL(12,2) NULL AFTER bucket;

