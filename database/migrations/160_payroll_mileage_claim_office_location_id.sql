-- Migration: Add office_location_id to payroll_mileage_claims
-- Description: Link school-travel mileage claims to an office_locations row.

ALTER TABLE payroll_mileage_claims
  ADD COLUMN office_location_id INT NULL AFTER school_organization_id;

CREATE INDEX idx_mileage_claims_office_location
  ON payroll_mileage_claims (office_location_id);

