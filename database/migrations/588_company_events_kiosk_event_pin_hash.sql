-- 6-digit station PIN (SHA-256 hex, same helper as user kiosk PIN) for public Skill Builders event kiosk unlock.
ALTER TABLE company_events
  ADD COLUMN kiosk_event_pin_hash VARCHAR(64) NULL DEFAULT NULL;
