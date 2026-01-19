-- Migration: Split PTO hours into sick + training buckets
-- Description: Supports reporting and correct PTO balance posting from approved PTO requests.

ALTER TABLE payroll_adjustments
  ADD COLUMN sick_pto_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER pto_hours,
  ADD COLUMN training_pto_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER sick_pto_hours;

