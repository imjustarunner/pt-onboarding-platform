-- Migration 852: allow staff to void an accidental client check-in
-- Adds soft-delete columns so the row is preserved for audit but excluded
-- from the live attendance view (action changed to 'voided').

ALTER TABLE event_day_kiosk_checkins
  ADD COLUMN voided_at DATETIME NULL DEFAULT NULL
    COMMENT 'When this check-in was voided by staff; NULL = not voided'
    AFTER checkin_signature_data,
  ADD COLUMN voided_by_name VARCHAR(160) NULL DEFAULT NULL
    COMMENT 'Full name of the staff member who authorized the void'
    AFTER voided_at;
