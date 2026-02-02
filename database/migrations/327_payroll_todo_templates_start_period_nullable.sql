-- Migration: Make payroll_todo_templates.start_payroll_period_id nullable
-- Purpose: Avoid FK issues across environments and represent "start immediately" as NULL.

-- Convert legacy sentinel (0) -> NULL
UPDATE payroll_todo_templates
SET start_payroll_period_id = NULL
WHERE start_payroll_period_id = 0;

-- Allow NULL for "start immediately"
ALTER TABLE payroll_todo_templates
  MODIFY start_payroll_period_id INT NULL DEFAULT NULL;

