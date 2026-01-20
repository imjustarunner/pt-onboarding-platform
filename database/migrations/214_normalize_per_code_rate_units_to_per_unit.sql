-- Per-user per-code rate units are deprecated; agency service code rules decide per_unit vs per_hour.
-- Normalize any existing per-code rate units to per_unit for consistency.

UPDATE payroll_rates
  SET rate_unit = 'per_unit'
  WHERE rate_unit IS NULL OR rate_unit <> 'per_unit';

UPDATE payroll_rate_template_rates
  SET rate_unit = 'per_unit'
  WHERE rate_unit IS NULL OR rate_unit <> 'per_unit';

