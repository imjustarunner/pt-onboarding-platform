-- Migration: Multi-agency offices (office_location_agencies)
-- Purpose:
-- - Allow a single office_location ("Office") to be assigned to multiple agencies.
-- - Preserve existing office_locations.agency_id as the original/primary agency for backward compatibility.
-- - Seed existing office_locations rows into the join table.

CREATE TABLE IF NOT EXISTS office_location_agencies (
  office_location_id INT NOT NULL,
  agency_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (office_location_id, agency_id),
  CONSTRAINT fk_office_location_agencies_location
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_location_agencies_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_office_location_agencies_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed: every existing office location belongs to its legacy agency_id
INSERT IGNORE INTO office_location_agencies (office_location_id, agency_id)
SELECT id AS office_location_id, agency_id
FROM office_locations
WHERE agency_id IS NOT NULL;

