-- Migration: Add notification trigger for meeting join reminders (email/SMS)

INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'meeting_join_reminder',
    'Meeting join reminder',
    'Email/SMS with join link 5 minutes before supervision or team meetings.',
    1,
    JSON_OBJECT('inApp', FALSE, 'sms', TRUE, 'email', TRUE),
    JSON_OBJECT('provider', TRUE, 'supervisor', TRUE, 'clinicalPracticeAssistant', TRUE, 'admin', TRUE)
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json);

-- Deduplication: avoid sending same join reminder twice for same session+user
CREATE TABLE IF NOT EXISTS join_reminder_sent (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_type ENUM('supervision', 'team_meeting') NOT NULL,
  session_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_join_reminder (session_type, session_id, user_id),
  INDEX idx_join_reminder_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
