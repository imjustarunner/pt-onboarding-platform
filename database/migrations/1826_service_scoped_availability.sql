-- Additive: existing reservations and publication times remain unchanged.
ALTER TABLE provider_virtual_working_hours ADD COLUMN service_type VARCHAR(32) NULL;
ALTER TABLE provider_virtual_slot_availability ADD COLUMN service_type VARCHAR(32) NULL;
ALTER TABLE provider_in_person_slot_availability ADD COLUMN service_type VARCHAR(32) NULL;
