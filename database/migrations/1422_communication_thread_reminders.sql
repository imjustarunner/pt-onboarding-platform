-- Personal reminders identify one conversation and retain a private reply bridge.
CREATE TABLE IF NOT EXISTS communication_thread_reminders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  inbox_id INT NOT NULL,
  internet_message_id VARCHAR(255) NOT NULL,
  delivery_status VARCHAR(24) NOT NULL DEFAULT 'sending',
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_thread_reminder (conversation_id, message_id, user_id),
  UNIQUE KEY uq_reminder_message_id (internet_message_id),
  KEY idx_reminder_inbox (inbox_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing explicit preferences remain intact.
ALTER TABLE user_communication_prefs
  MODIFY personal_email_notify TINYINT(1) NOT NULL DEFAULT 1,
  MODIFY digest_hours SMALLINT NOT NULL DEFAULT 24;
