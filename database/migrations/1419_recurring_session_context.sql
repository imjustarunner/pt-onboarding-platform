-- Preserve the client and service when office booking plans materialize future sessions.
ALTER TABLE office_booking_plans ADD COLUMN session_context_json JSON NULL;

ALTER TABLE office_events ADD COLUMN session_context_json JSON NULL;
ALTER TABLE office_booking_requests ADD COLUMN session_context_json JSON NULL;

ALTER TABLE appointments
  ADD COLUMN service_location_id INT NULL,
  ADD COLUMN source_timezone VARCHAR(64) NULL;
