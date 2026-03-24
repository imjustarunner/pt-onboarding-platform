-- Distinguish user-confirmed booking plans from Therapy Notes / ICS auto-matched plans.
-- User plans get a 6-week grace period before TN overlap is required; ehr_sync plans fall back
-- to assigned_available when the last two past occurrences have no external busy overlap.

ALTER TABLE office_booking_plans
  ADD COLUMN booking_origin ENUM('user', 'ehr_sync') NOT NULL DEFAULT 'ehr_sync'
    COMMENT 'user = provider set booking in app | ehr_sync = TN/ICS refresh'
    AFTER created_by_user_id,
  ADD COLUMN user_booking_confirmed_at DATETIME NULL DEFAULT NULL
    COMMENT 'When booking_origin became user (6-week TN grace window anchor)'
    AFTER booking_origin;

-- Existing rows cannot be distinguished; treat as user-confirmed so we do not mass-downgrade on deploy.
UPDATE office_booking_plans
SET booking_origin = 'user',
    user_booking_confirmed_at = COALESCE(last_confirmed_at, created_at, CURRENT_TIMESTAMP)
WHERE user_booking_confirmed_at IS NULL;

INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'office_schedule_booked_reverted_no_tn',
    'Office booking reverted — no Therapy Notes overlap',
    'When a booked office slot is set back to available because external ICS (Therapy Notes) did not overlap recent booked occurrences within the allowed window.',
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
