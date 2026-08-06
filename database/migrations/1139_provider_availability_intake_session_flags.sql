-- Migration 1139: independent intake/session availability flags
-- Replaces reliance on a single session_type enum for "new client" vs "current client" booking.

ALTER TABLE provider_virtual_working_hours
  ADD COLUMN available_for_intake TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Open for new-client / intake booking search'
    AFTER session_type,
  ADD COLUMN available_for_session TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Open for current/ongoing client session booking'
    AFTER available_for_intake;

ALTER TABLE provider_virtual_slot_availability
  ADD COLUMN available_for_intake TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Open for new-client / intake booking search'
    AFTER session_type,
  ADD COLUMN available_for_session TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Open for current/ongoing client session booking'
    AFTER available_for_intake;

ALTER TABLE provider_in_person_slot_availability
  ADD COLUMN available_for_intake TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Open for new-client / intake booking search'
    AFTER is_active,
  ADD COLUMN available_for_session TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Open for current/ongoing client session booking'
    AFTER available_for_intake;

-- Backfill virtual working hours from session_type
UPDATE provider_virtual_working_hours
SET
  available_for_intake = CASE
    WHEN UPPER(COALESCE(session_type, '')) IN ('INTAKE', 'BOTH') THEN 1
    ELSE 0
  END,
  available_for_session = CASE
    WHEN UPPER(COALESCE(session_type, '')) IN ('REGULAR', 'BOTH') THEN 1
    ELSE 0
  END;

-- Backfill virtual slot overrides from session_type
UPDATE provider_virtual_slot_availability
SET
  available_for_intake = CASE
    WHEN UPPER(COALESCE(session_type, '')) IN ('INTAKE', 'BOTH') THEN 1
    ELSE 0
  END,
  available_for_session = CASE
    WHEN UPPER(COALESCE(session_type, '')) IN ('REGULAR', 'BOTH') THEN 1
    ELSE 0
  END;

-- In-person rows historically meant intake-on when present; keep that default.
UPDATE provider_in_person_slot_availability
SET available_for_intake = 1
WHERE available_for_intake = 0 AND is_active = 1;

CREATE INDEX idx_pvwh_intake_session
  ON provider_virtual_working_hours (agency_id, provider_id, available_for_intake, available_for_session);

CREATE INDEX idx_pvsa_intake_session
  ON provider_virtual_slot_availability (agency_id, provider_id, available_for_intake, available_for_session, is_active);
