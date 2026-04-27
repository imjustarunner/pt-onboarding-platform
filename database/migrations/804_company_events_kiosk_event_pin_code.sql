-- Store the shared 6-digit station PIN for program-event kiosks so admins can
-- view/share it after saving. The SHA-256 hash remains the lookup value used
-- by public unlock endpoints.
ALTER TABLE company_events
  ADD COLUMN kiosk_event_pin_code VARCHAR(6) NULL DEFAULT NULL;
