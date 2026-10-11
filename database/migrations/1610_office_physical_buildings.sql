-- A shared physical building can have several agency-owned billing identities.
-- NULL means this row is the physical building; a value means a billing identity
-- at that building. Keep billing IDs, NPIs, claims, and service-site links intact.
ALTER TABLE office_locations ADD COLUMN physical_office_location_id INT NULL;
ALTER TABLE office_locations ADD INDEX idx_office_physical_location (physical_office_location_id);
ALTER TABLE office_locations ADD CONSTRAINT fk_office_physical_location
  FOREIGN KEY (physical_office_location_id) REFERENCES office_locations(id) ON DELETE RESTRICT;
