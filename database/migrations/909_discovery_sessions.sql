-- Migration 909: discovery sessions (Phase 3) + join reminder support
-- Coach proposes selectable time options via private token; client selects → books calendar + Vonage join.

CREATE TABLE IF NOT EXISTS discovery_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  client_id INT NOT NULL,
  public_appointment_request_id INT NULL,
  access_token VARCHAR(64) NOT NULL,
  token_expires_at DATETIME NULL,
  status ENUM('DRAFT','PROPOSED','BOOKED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  proposed_options_json JSON NULL,
  selected_option_index INT NULL,
  booked_start_at DATETIME NULL,
  booked_end_at DATETIME NULL,
  countdown_minutes INT NOT NULL DEFAULT 15,
  provider_schedule_event_id INT NULL,
  vonage_session_id VARCHAR(255) NULL,
  room_unique_name VARCHAR(255) NULL,
  client_email VARCHAR(320) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  client_phone VARCHAR(64) NULL,
  notes TEXT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_discovery_access_token (access_token),
  KEY idx_discovery_agency_status (agency_id, status),
  KEY idx_discovery_client (client_id),
  KEY idx_discovery_provider (provider_id),
  KEY idx_discovery_booked_start (booked_start_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend join reminder dedupe for discovery (coach user + client email)
ALTER TABLE join_reminder_sent
  MODIFY COLUMN session_type ENUM('supervision', 'team_meeting', 'discovery') NOT NULL;

ALTER TABLE join_reminder_sent
  ADD COLUMN recipient_key VARCHAR(96) NULL DEFAULT NULL
  COMMENT 'u:{userId} or e:{email} for discovery client reminders'
  AFTER user_id;

UPDATE join_reminder_sent
SET recipient_key = CONCAT('u:', user_id)
WHERE recipient_key IS NULL AND user_id IS NOT NULL;

ALTER TABLE join_reminder_sent
  DROP INDEX uq_join_reminder;

ALTER TABLE join_reminder_sent
  ADD UNIQUE KEY uq_join_reminder (session_type, session_id, recipient_key);

INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'discovery_session_invite',
    'Discovery session invite',
    'Email with private token link so a prospective client can select a discovery time.',
    1,
    JSON_OBJECT('inApp', FALSE, 'sms', FALSE, 'email', TRUE),
    JSON_OBJECT('client', TRUE)
  ),
  (
    'discovery_session_confirmed',
    'Discovery session confirmed',
    'Confirmation after a prospective client selects a discovery time.',
    1,
    JSON_OBJECT('inApp', FALSE, 'sms', FALSE, 'email', TRUE),
    JSON_OBJECT('client', TRUE, 'provider', TRUE)
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json);
