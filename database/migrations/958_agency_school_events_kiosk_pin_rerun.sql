-- Migration 958: agency-wide school events kiosk PIN (re-applies 957 if columns were missed)
ALTER TABLE agencies
  ADD COLUMN school_events_kiosk_pin_hash VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'SHA-256 of the school-events hub kiosk PIN (4–6 digits)',
  ADD COLUMN school_events_kiosk_pin_code VARCHAR(6) NULL DEFAULT NULL
    COMMENT 'Plain 4–6 digit PIN for admin sharing (school-events hub kiosk)';
