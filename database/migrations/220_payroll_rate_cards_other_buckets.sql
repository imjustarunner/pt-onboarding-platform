-- Migration: Add direct/indirect bucket mapping for rate card "other" slots
-- Description: Allows each provider's Other 1/2/3 rate to be counted toward Direct or Indirect totals.

ALTER TABLE payroll_rate_cards
  ADD COLUMN other_rate_1_bucket ENUM('direct','indirect','other') NOT NULL DEFAULT 'other' AFTER other_rate_1,
  ADD COLUMN other_rate_2_bucket ENUM('direct','indirect','other') NOT NULL DEFAULT 'other' AFTER other_rate_2,
  ADD COLUMN other_rate_3_bucket ENUM('direct','indirect','other') NOT NULL DEFAULT 'other' AFTER other_rate_3;

