-- Migration: Expand payroll service code rules fields
-- Description: Add duration + tier credit multiplier to support richer equivalency rules.

ALTER TABLE payroll_service_code_rules
  ADD COLUMN duration_minutes INT NULL AFTER unit_to_hour_multiplier,
  ADD COLUMN tier_credit_multiplier DECIMAL(12,4) NOT NULL DEFAULT 1.0000 AFTER counts_for_tier;

