-- Migration 853: add 'voided' to the action ENUM on event_day_kiosk_checkins
-- Required for the staff-verified check-in removal feature (migration 852).

ALTER TABLE event_day_kiosk_checkins
  MODIFY COLUMN action ENUM('check_in', 'check_out', 'absent', 'voided') NOT NULL;
