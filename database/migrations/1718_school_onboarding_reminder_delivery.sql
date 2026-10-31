CREATE TABLE IF NOT EXISTS school_onboarding_email_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invite_id INT NOT NULL,
  kind VARCHAR(20) NOT NULL,
  delivery_key VARCHAR(128) NOT NULL,
  recipient VARCHAR(320) NOT NULL,
  delivery_status VARCHAR(20) NOT NULL,
  communication_id INT NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_onboarding_delivery (invite_id,delivery_key),
  KEY idx_school_onboarding_delivery_status (delivery_status,communication_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
