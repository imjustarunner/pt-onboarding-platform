-- Occurrence exceptions survive schedule edits; care types narrow a publication.
ALTER TABLE provider_virtual_working_hours ADD COLUMN excluded_dates_json JSON NULL, ADD COLUMN care_types_json JSON NULL;
ALTER TABLE provider_virtual_slot_availability ADD COLUMN series_id VARCHAR(36) NULL, ADD COLUMN care_types_json JSON NULL;
ALTER TABLE provider_in_person_slot_availability ADD COLUMN series_id VARCHAR(36) NULL, ADD COLUMN care_types_json JSON NULL;
CREATE INDEX idx_virtual_publication_series ON provider_virtual_slot_availability (agency_id,provider_id,series_id);
CREATE INDEX idx_inperson_publication_series ON provider_in_person_slot_availability (agency_id,provider_id,series_id);
