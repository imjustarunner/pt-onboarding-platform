-- Security notices contain event metadata only, never passwords, passcodes or tokens.
CREATE TABLE IF NOT EXISTS credential_change_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_key VARCHAR(120) NOT NULL,
  user_id INT NOT NULL,
  agency_id INT NULL,
  credential_kind ENUM('password','quick_view') NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  delivery_status ENUM('pending','sent','review') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  last_error VARCHAR(500) NULL,
  UNIQUE KEY uq_credential_notice_event (event_key),
  KEY idx_credential_notice_pending (delivery_status,next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
