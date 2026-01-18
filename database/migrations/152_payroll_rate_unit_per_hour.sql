-- Migration: Add per_hour to payroll rate_unit enums
-- Description: Supports per-code hourly-equivalent rates (hours * rate) alongside per_unit and flat.

ALTER TABLE payroll_rates
  MODIFY COLUMN rate_unit ENUM('per_unit','per_hour','flat') DEFAULT 'per_unit';

ALTER TABLE payroll_rate_template_rates
  MODIFY COLUMN rate_unit ENUM('per_unit','per_hour','flat') NOT NULL DEFAULT 'per_unit';

