ALTER TABLE payroll_rates
  ADD COLUMN pay_system_excluded TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN pay_system_exclusion_reason VARCHAR(255) NULL,
  ADD COLUMN pay_system_excluded_by_user_id INT NULL;
