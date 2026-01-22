-- Payroll adjustments: add tax-exempt tuition reimbursement
-- This is a manual per-provider add-on entered in Payroll Stage for a pay period.
-- It should display as its own line item on the export report and provider pay statement.

ALTER TABLE payroll_adjustments
  ADD COLUMN tuition_reimbursement_amount DECIMAL(12,2) NOT NULL DEFAULT 0
  AFTER reimbursement_amount;

