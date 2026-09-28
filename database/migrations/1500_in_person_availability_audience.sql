-- Preserve existing intake publications; allow staff to publish current-client time separately.
ALTER TABLE provider_in_person_slot_availability
  ADD COLUMN available_for_intake BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN available_for_session BOOLEAN NOT NULL DEFAULT FALSE;
