-- Migration 1380: Hub send delay prefs + queued message table
ALTER TABLE user_communication_prefs
  ADD COLUMN send_delay_email_seconds INT NOT NULL DEFAULT 20
    COMMENT 'Undo/delay window for Hub email (1–600s)',
  ADD COLUMN send_delay_secure_seconds INT NOT NULL DEFAULT 20
    COMMENT 'Undo/delay window for Hub secure messages (1–600s)',
  ADD COLUMN send_delay_internal_seconds INT NOT NULL DEFAULT 20
    COMMENT 'Undo/delay window for Hub internal chat (1–600s)',
  ADD COLUMN send_delay_sms_seconds INT NOT NULL DEFAULT 20
    COMMENT 'Undo/delay window for Hub SMS (1–600s)';

CREATE TABLE IF NOT EXISTS hub_message_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  person_key VARCHAR(191) NOT NULL,
  channel VARCHAR(32) NOT NULL COMMENT 'secure|internal|sms|email',
  body MEDIUMTEXT NULL,
  subject VARCHAR(500) NULL,
  payload_json JSON NULL COMMENT 'Attachments, cc/bcc, aliases, etc.',
  scheduled_send_at DATETIME NOT NULL,
  queue_reason VARCHAR(32) NOT NULL DEFAULT 'undo_delay'
    COMMENT 'undo_delay|schedule|availability',
  status VARCHAR(16) NOT NULL DEFAULT 'queued'
    COMMENT 'queued|sent|cancelled|failed',
  related_conversation_id BIGINT UNSIGNED NULL,
  related_message_id BIGINT UNSIGNED NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hub_queue_due (status, scheduled_send_at),
  KEY idx_hub_queue_user (user_id, status, scheduled_send_at),
  KEY idx_hub_queue_agency (agency_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
