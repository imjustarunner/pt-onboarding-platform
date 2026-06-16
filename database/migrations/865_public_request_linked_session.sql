-- Migration 865: Link public appointment requests to created office events or sessions
-- When an in-person public request is approved, the system books the matching office_event
-- and stores the ID here so the admin UI can link directly to the booking.

ALTER TABLE public_appointment_requests
  ADD COLUMN linked_office_event_id INT NULL DEFAULT NULL
    COMMENT 'office_events.id created/booked when this in-person request was approved',
  ADD COLUMN linked_session_id INT NULL DEFAULT NULL
    COMMENT 'learning_class_sessions.id created when a tutoring request was approved';

-- Notification trigger for new public appointment requests (admin alert)
INSERT INTO notification_triggers (trigger_key, name, description)
VALUES
  ('public_appointment_request_received',
   'New public appointment request',
   'Sent to provider when a new appointment request arrives from the public booking page.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);
