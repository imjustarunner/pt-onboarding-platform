-- Migration 957: agency-wide school events kiosk PIN
ALTER TABLE agencies
  ADD COLUMN school_events_kiosk_pin_hash VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'SHA-256 of 6-digit school-events hub kiosk PIN',
  ADD COLUMN school_events_kiosk_pin_code VARCHAR(6) NULL DEFAULT NULL
    COMMENT 'Plain 4–6 digit PIN for admin share (school-events hub kiosk)';
