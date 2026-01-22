-- Migration: Payroll manual pay lines category (direct/indirect)
-- Description: Allows manual pay lines to be categorized so they can count toward Direct/Indirect hour totals and PTO accrual basis.

ALTER TABLE payroll_manual_pay_lines
  ADD COLUMN category ENUM('direct','indirect') NOT NULL DEFAULT 'direct' AFTER label;

