-- Migration: Office schedule notification triggers
-- Purpose: Register trigger keys so we can use notification_events dedupe + agency overrides.

INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'office_schedule_biweekly_review',
    'Office schedule biweekly review',
    'Prompts providers every payroll cycle to review office reservations (book, keep available, temporary, or forfeit).',
    1,
    JSON_OBJECT('inApp', TRUE, 'sms', FALSE, 'email', FALSE),
    JSON_OBJECT('provider', TRUE, 'admin', TRUE, 'clinicalPracticeAssistant', TRUE)
  ),
  (
    'office_schedule_booking_confirm_6_weeks',
    'Office schedule booking confirmation (6 weeks)',
    'Prompts providers every ~6 weeks to confirm whether booked office slots should remain booked.',
    1,
    JSON_OBJECT('inApp', TRUE, 'sms', FALSE, 'email', FALSE),
    JSON_OBJECT('provider', TRUE, 'admin', TRUE, 'clinicalPracticeAssistant', TRUE)
  ),
  (
    'office_schedule_unbooked_forfeit',
    'Office schedule unbooked forfeit',
    'Notifies when assigned_available slots remain unbooked for 6 weeks and are automatically forfeited.',
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

