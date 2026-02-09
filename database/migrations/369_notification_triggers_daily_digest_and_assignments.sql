-- Migration: Add notification triggers for daily digest + client assignment + school portal messages

INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'client_assigned',
    'Client assigned',
    'Notify providers when a client is assigned to them.',
    1,
    JSON_OBJECT('inApp', TRUE, 'sms', TRUE, 'email', TRUE),
    JSON_OBJECT('provider', TRUE, 'supervisor', FALSE, 'clinicalPracticeAssistant', FALSE, 'admin', FALSE)
  ),
  (
    'daily_digest',
    'Daily digest',
    'Daily summary of updates relevant to a user.',
    1,
    JSON_OBJECT('inApp', FALSE, 'sms', FALSE, 'email', TRUE),
    JSON_OBJECT('provider', TRUE, 'supervisor', TRUE, 'clinicalPracticeAssistant', TRUE, 'admin', TRUE)
  ),
  (
    'school_portal_client_messages',
    'School portal messages',
    'Email notifications for school portal ticket messages.',
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
