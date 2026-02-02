-- Migration: Payroll missing-notes reminder trigger
-- Purpose: Register trigger key so we can use notification_events dedupe + agency overrides.

INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'payroll_missing_notes_reminder',
    'Payroll missing notes reminder',
    'When a payroll period is posted, reminds providers if they still have NO_NOTE/DRAFT units in that pay period (documentation reminders, including missed appointment notes).',
    1,
    JSON_OBJECT('inApp', TRUE, 'sms', FALSE, 'email', FALSE),
    JSON_OBJECT('provider', TRUE, 'supervisor', FALSE, 'clinicalPracticeAssistant', FALSE, 'admin', FALSE)
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json);

