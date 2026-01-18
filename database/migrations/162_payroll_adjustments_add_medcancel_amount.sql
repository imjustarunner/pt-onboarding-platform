-- Migration: Add MedCancel adjustment field
-- Description: Track MedCancel add-on/override separately from other taxable adjustments.

ALTER TABLE payroll_adjustments
  ADD COLUMN medcancel_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER mileage_amount;

