-- Migration: Add notification trigger for meeting cancellations.
-- Used when a host or admin cancels a TEAM_MEETING / HUDDLE; attendees and
-- the host receive an email letting them know the meeting won't happen.

INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'meeting_cancelled',
    'Meeting cancelled',
    'Email sent to attendees and the host when a meeting is cancelled (one-off or as part of cancelling the rest of the day).',
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
