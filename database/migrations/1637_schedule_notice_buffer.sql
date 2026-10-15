CREATE TABLE IF NOT EXISTS appointment_schedule_notices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  client_id INT NOT NULL,
  event_type VARCHAR(24) NOT NULL,
  batch_id BIGINT UNSIGNED NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  payload_json JSON NOT NULL,
  channels_json JSON NOT NULL,
  fire_at DATETIME NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_schedule_notice_due (status,fire_at),
  KEY idx_schedule_notice_recipient (agency_id,provider_id,client_id,status),
  KEY idx_schedule_notice_appointment (appointment_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_schedule_notice_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  channel VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'sending',
  message_json JSON NOT NULL,
  recipient_address VARCHAR(320) NULL,
  communication_id INT NULL,
  external_message_id VARCHAR(255) NULL,
  error_message VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_schedule_notice_delivery (batch_id,channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
