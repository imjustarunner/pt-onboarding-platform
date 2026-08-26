-- Migration 1309: client default office and place of service for booking/claims
-- Used as the preferred office/POS when scheduling sessions and building billing claims.
-- Can be overridden per appointment; typically seeded from the client's primary provider office.

ALTER TABLE clients
  ADD COLUMN default_office_location_id INT NULL DEFAULT NULL
    COMMENT 'Preferred office building for sessions/claims'
    AFTER provider_id,
  ADD COLUMN default_place_of_service VARCHAR(10) NULL DEFAULT NULL
    COMMENT 'Preferred CMS place of service code (e.g. 11, 02, 03)'
    AFTER default_office_location_id,
  ADD COLUMN default_service_location_id INT NULL DEFAULT NULL
    COMMENT 'Optional agency_service_locations.id for claim POS detail'
    AFTER default_place_of_service;

ALTER TABLE clients
  ADD CONSTRAINT fk_clients_default_office_location
    FOREIGN KEY (default_office_location_id) REFERENCES office_locations(id) ON DELETE SET NULL;

ALTER TABLE clients
  ADD CONSTRAINT fk_clients_default_service_location
    FOREIGN KEY (default_service_location_id) REFERENCES agency_service_locations(id) ON DELETE SET NULL;
