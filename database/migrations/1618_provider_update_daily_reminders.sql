-- Explicitly enabled per update; draft and preview updates never send reminders.
CREATE TABLE IF NOT EXISTS provider_update_reminder_settings (
  push_id INT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Denver',
  local_hour TINYINT UNSIGNED NOT NULL DEFAULT 9,
  updated_by_user_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (push_id) REFERENCES provider_update_pushes(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_update_reminder_deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_id INT NOT NULL,
  reminder_date DATE NOT NULL,
  channel ENUM('email','sms') NOT NULL,
  status ENUM('sending','sent','pending','skipped','failed') NOT NULL DEFAULT 'sending',
  communication_id INT NULL,
  sms_log_id INT NULL,
  external_message_id VARCHAR(255) NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_update_daily_reminder (recipient_id,reminder_date,channel),
  KEY idx_provider_update_reminder_pending (status,communication_id),
  FOREIGN KEY (recipient_id) REFERENCES provider_update_recipients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
