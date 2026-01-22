-- Payroll: manual pay lines optional hours/credits
-- Adds optional hours/credits to allow manual pay lines to increase hour/credit totals.

ALTER TABLE payroll_manual_pay_lines
  ADD COLUMN credits_hours DECIMAL(12,2) NULL AFTER category;

