-- A shared building's owner is not the tenant receiving the provider's sessions.
-- Existing ambiguous rows remain unset until an authorized scheduler selects one.
ALTER TABLE office_standing_assignments ADD COLUMN booking_agency_id INT NULL;
