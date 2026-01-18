-- Migration: Add school-travel mileage fields to payroll_mileage_claims
-- Description: Support round-trip delta calculation: (home↔school RT) − (home↔office RT) = eligible miles.

ALTER TABLE payroll_mileage_claims
  ADD COLUMN claim_type VARCHAR(32) NOT NULL DEFAULT 'standard' AFTER status,
  ADD COLUMN school_organization_id INT NULL AFTER drive_date,
  ADD COLUMN office_key VARCHAR(64) NULL AFTER school_organization_id,
  ADD COLUMN home_school_roundtrip_miles DECIMAL(10,2) NULL AFTER office_key,
  ADD COLUMN home_office_roundtrip_miles DECIMAL(10,2) NULL AFTER home_school_roundtrip_miles,
  ADD COLUMN eligible_miles DECIMAL(10,2) NULL AFTER home_office_roundtrip_miles;

CREATE INDEX idx_mileage_claims_school
  ON payroll_mileage_claims (school_organization_id);

CREATE INDEX idx_mileage_claims_office_key
  ON payroll_mileage_claims (office_key);

