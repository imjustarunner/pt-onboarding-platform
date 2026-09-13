-- Pending intake selections protect a weekly opening until explicitly resolved.
ALTER TABLE public_provider_slot_holds
  MODIFY expires_at DATETIME(3) NULL,
  ADD COLUMN time_zone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  ADD COLUMN client_id INT NULL,
  ADD COLUMN released_at DATETIME(3) NULL,
  ADD COLUMN resolution VARCHAR(40) NULL,
  ADD COLUMN resolved_by_user_id INT NULL,
  ADD KEY idx_public_hold_client (client_id, released_at);
-- Never revive expired selections from the earlier fifteen-minute implementation.
UPDATE public_provider_slot_holds SET released_at = UTC_TIMESTAMP(3), resolution = 'LEGACY_EXPIRED'
WHERE expires_at <= UTC_TIMESTAMP(3);
UPDATE public_provider_slot_holds SET expires_at = NULL WHERE released_at IS NULL;
-- Preserve the scheduler's local timezone for selections made before this migration.
UPDATE public_provider_slot_holds h
JOIN office_location_agencies ola ON ola.agency_id=h.agency_id
JOIN office_locations ol ON ol.id=ola.office_location_id AND ol.is_active=TRUE
SET h.time_zone=COALESCE(NULLIF(ol.timezone,''),'America/New_York')
WHERE h.released_at IS NULL AND ol.id=(
  SELECT MIN(ol2.id) FROM office_locations ol2
  JOIN office_location_agencies ola2 ON ola2.office_location_id=ol2.id
  WHERE ola2.agency_id=h.agency_id AND ol2.is_active=TRUE
);
UPDATE public_provider_slot_holds SET time_zone='America/New_York'
WHERE released_at IS NULL AND time_zone='UTC';
