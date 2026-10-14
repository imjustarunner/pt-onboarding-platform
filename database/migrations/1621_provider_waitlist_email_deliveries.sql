-- One weekly update per provider waitlist cycle. No contact details or clinical
-- content are stored here; messages use the existing communications audit log.
CREATE TABLE IF NOT EXISTS provider_waitlist_email_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  submission_id INT NULL,
  cycle_key CHAR(64) NOT NULL,
  week_number INT UNSIGNED NOT NULL,
  audience VARCHAR(24) NOT NULL,
  delivery_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  communication_id INT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  UNIQUE KEY uq_provider_waitlist_week (agency_id,client_id,provider_id,cycle_key,week_number),
  KEY ix_provider_waitlist_email_due (delivery_status,next_attempt_at),
  KEY ix_provider_waitlist_email_client (agency_id,client_id,provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
