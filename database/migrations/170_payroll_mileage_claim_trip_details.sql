-- Migration: Add trip detail fields to payroll_mileage_claims
-- Description: Capture approval + purpose metadata for "Other Mileage" submissions.

ALTER TABLE payroll_mileage_claims
  ADD COLUMN trip_purpose VARCHAR(255) NULL AFTER end_location,
  ADD COLUMN trip_approved_by VARCHAR(255) NULL AFTER trip_purpose,
  ADD COLUMN trip_preapproved TINYINT(1) NULL AFTER trip_approved_by,
  ADD COLUMN cost_center VARCHAR(255) NULL AFTER trip_preapproved;

