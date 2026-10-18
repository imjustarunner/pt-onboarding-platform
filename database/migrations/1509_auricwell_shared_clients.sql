-- AuricWell keeps product access metadata and stable public chart IDs, while
-- organizations and patient demographics use the existing canonical tables.
-- Existing prototype records remain readable until reviewed consolidation.
ALTER TABLE auricwell_practices
  ADD CONSTRAINT aw_canonical_agency FOREIGN KEY (agency_id) REFERENCES agencies(id);

ALTER TABLE auricwell_records
  ADD COLUMN canonical_client_id INT NULL,
  ADD CONSTRAINT aw_canonical_client FOREIGN KEY (canonical_client_id) REFERENCES clients(id),
  ADD UNIQUE KEY aw_client_binding (practice_id, canonical_client_id);
