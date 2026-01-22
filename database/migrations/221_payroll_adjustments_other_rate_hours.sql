-- Migration: Add hour-based adjustments for multi-rate "other" slots
-- Description: Allows per-period add-on hours that are paid at the provider's multi-rate card "Other 1/2/3" rates.

ALTER TABLE payroll_adjustments
  ADD COLUMN other_rate_1_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER reimbursement_amount,
  ADD COLUMN other_rate_2_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER other_rate_1_hours,
  ADD COLUMN other_rate_3_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER other_rate_2_hours;

