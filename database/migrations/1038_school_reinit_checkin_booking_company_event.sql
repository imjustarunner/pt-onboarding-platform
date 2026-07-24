-- Migration 1038: link fall check-in bookings to school portal Fall School Check-in events
ALTER TABLE school_reinit_checkin_bookings
  ADD COLUMN company_event_id INT NULL DEFAULT NULL
  COMMENT 'Linked school portal company_events.id (school_fall_check_in)'
  AFTER meet_link;

ALTER TABLE school_reinit_checkin_bookings
  ADD INDEX idx_checkin_booking_company_event (company_event_id);
