-- Payroll adjustments: add IMatter + Missed Appointments
-- These are manual per-provider add-ons entered in Payroll Stage for a pay period.

ALTER TABLE payroll_adjustments
  ADD COLUMN imatter_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER other_taxable_amount,
  ADD COLUMN missed_appointments_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER imatter_amount;

