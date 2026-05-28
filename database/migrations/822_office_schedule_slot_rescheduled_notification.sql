-- Migration 822: Office schedule slot rescheduled notification trigger
INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'office_schedule_slot_rescheduled',
    'Office schedule slot rescheduled',
    'Notifies a provider when an admin moves their recurring office slot to a different day, time, or room.',
    1,
    JSON_OBJECT('inApp', TRUE, 'sms', FALSE, 'email', TRUE),
    JSON_OBJECT('provider', TRUE, 'admin', FALSE, 'clinicalPracticeAssistant', FALSE)
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json);
