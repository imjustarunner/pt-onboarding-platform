-- Payroll service code rules: agency-level pay rate unit (per_unit vs per_hour)
-- This replaces per-user per-code rate_unit selection; payroll uses the agency rule.

ALTER TABLE payroll_service_code_rules
  ADD COLUMN pay_rate_unit ENUM('per_unit','per_hour') NOT NULL DEFAULT 'per_unit' AFTER pay_divisor;

