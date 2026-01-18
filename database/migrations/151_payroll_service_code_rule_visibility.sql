-- Add visibility control for rate sheet display
ALTER TABLE payroll_service_code_rules
  ADD COLUMN show_in_rate_sheet TINYINT(1) NOT NULL DEFAULT 1;

