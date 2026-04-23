-- Migration: Add notification triggers for meeting invites and reschedules.
-- Used by:
--   meeting_invited     – when a user is invited to a TEAM_MEETING / HUDDLE
--                         (e.g. the assistant's startMeeting flow).
--   meeting_rescheduled – when the time of a meeting changes.

INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'meeting_invited',
    'Meeting invitation',
    'Email sent to an attendee when they are invited to a meeting (e.g. an ad-hoc meeting started from the assistant).',
    1,
    JSON_OBJECT('inApp', FALSE, 'sms', FALSE, 'email', TRUE),
    JSON_OBJECT('provider', TRUE, 'supervisor', TRUE, 'clinicalPracticeAssistant', TRUE, 'admin', TRUE)
  ),
  (
    'meeting_rescheduled',
    'Meeting rescheduled',
    'Email sent to attendees and the host when the time of a meeting changes (single reschedule or bulk shift).',
    1,
    JSON_OBJECT('inApp', FALSE, 'sms', FALSE, 'email', TRUE),
    JSON_OBJECT('provider', TRUE, 'supervisor', TRUE, 'clinicalPracticeAssistant', TRUE, 'admin', TRUE)
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json);
