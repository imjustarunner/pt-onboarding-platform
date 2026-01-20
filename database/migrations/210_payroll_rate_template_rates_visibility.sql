-- Track per-template visibility of service codes in the rate sheet UI.
-- When a template is applied, it should also apply which codes are hidden/visible.

ALTER TABLE payroll_rate_template_rates
  ADD COLUMN show_in_rate_sheet TINYINT(1) NOT NULL DEFAULT 1;

