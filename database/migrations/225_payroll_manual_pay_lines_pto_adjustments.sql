-- Payroll: manual pay lines - support PTO balance adjustments
-- Adds a line_type to distinguish wage corrections vs PTO bank adjustments.

ALTER TABLE payroll_manual_pay_lines
  ADD COLUMN line_type ENUM('pay','pto') NOT NULL DEFAULT 'pay' AFTER user_id,
  ADD COLUMN pto_bucket ENUM('sick','training') NULL AFTER line_type;

