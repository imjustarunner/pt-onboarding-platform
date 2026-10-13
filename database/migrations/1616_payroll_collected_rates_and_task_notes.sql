-- Per-employee collected-revenue rates do not enable percentage pay for other employees.
ALTER TABLE payroll_rates ADD COLUMN pay_method ENUM('fixed_rate','percent_collected') NULL DEFAULT NULL AFTER pay_percent;
-- A note belongs to one task instance, never to its recurring template.
ALTER TABLE payroll_period_todos ADD COLUMN notes TEXT NULL,
  ADD COLUMN notes_updated_by_user_id INT NULL,
  ADD COLUMN notes_updated_at DATETIME NULL;
