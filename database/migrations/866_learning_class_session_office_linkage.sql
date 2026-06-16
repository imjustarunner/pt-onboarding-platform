-- Migration 866: Link learning_class_sessions to office events and tutoring metadata
-- Adds office_event_id so in-person tutoring sessions know which room they use.
-- Adds provider_user_id for direct tutor association on individual sessions.

ALTER TABLE learning_class_sessions
  ADD COLUMN office_event_id INT NULL DEFAULT NULL
    COMMENT 'office_events.id for the in-person room this session is held in',
  ADD COLUMN provider_user_id INT NULL DEFAULT NULL
    COMMENT 'Tutor / provider user for individual (private) sessions';

-- Notification trigger for session launch
INSERT INTO notification_triggers (trigger_key, name, description)
VALUES
  ('tutoring_session_scheduled',
   'Tutoring session scheduled',
   'Sent to provider and guardian/client when a tutoring session is confirmed and ready to launch.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);
