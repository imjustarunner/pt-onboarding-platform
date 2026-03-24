-- Register trigger key for dedupe / agency overrides (optional; notifications also use application-layer type).
INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'office_schedule_booked_no_external_calendar_2_weeks',
    'Office booked but no Therapy Notes overlap (2 occurrences)',
    'When an office slot is marked booked but external ICS (Therapy Notes) busy time did not overlap the last two booked occurrences.',
    1,
    JSON_OBJECT('inApp', TRUE, 'sms', FALSE, 'email', FALSE),
    JSON_OBJECT('provider', TRUE, 'admin', TRUE, 'clinicalPracticeAssistant', TRUE)
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json);
