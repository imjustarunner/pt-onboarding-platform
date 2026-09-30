-- Durable, cancelable email fallback for newly created office arrival alerts.
CREATE TABLE IF NOT EXISTS office_arrival_deliveries (
  notification_id INT NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  due_at DATETIME NOT NULL,
  acknowledged_at DATETIME NULL,
  email_status ENUM('pending','sending','sent','suppressed','failed','expired','pending_approval') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  action_token_hash CHAR(64) NULL,
  action_expires_at DATETIME NULL,
  last_error VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY arrival_due (email_status, due_at),
  KEY arrival_provider (user_id, acknowledged_at, created_at),
  UNIQUE KEY arrival_action (action_token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
