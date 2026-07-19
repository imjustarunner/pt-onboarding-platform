-- Migration 996: Link service locations to school organizations (site of service).
-- Claims still bill under billing_office_location_id; school is for POS / clinical site only.

ALTER TABLE agency_service_locations
  ADD COLUMN school_organization_id INT NULL
  COMMENT 'agencies.id where organization_type = school — clinical site, not claim billing address';

ALTER TABLE agency_service_locations
  ADD INDEX idx_asl_school_org (agency_id, school_organization_id);
