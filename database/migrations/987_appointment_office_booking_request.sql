-- Migration 987: Link appointments to office booking requests (open slot + office request)
ALTER TABLE appointments
  ADD COLUMN office_booking_request_id INT NULL DEFAULT NULL
  COMMENT 'Optional link when booking opens a slot and requests office for the same series'
  AFTER office_event_id;

ALTER TABLE appointments
  ADD KEY idx_appointments_office_booking_request (office_booking_request_id);
