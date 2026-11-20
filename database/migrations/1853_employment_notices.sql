CREATE TABLE IF NOT EXISTS employment_notices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(100) NOT NULL UNIQUE,
  subject VARCHAR(250) NOT NULL,
  letter TEXT NOT NULL,
  contact_email VARCHAR(254) NOT NULL,
  publish_at DATETIME(3) NOT NULL,
  restrict_from DATETIME(3) NOT NULL,
  restrict_until DATETIME(3) NOT NULL,
  link_until DATETIME(3) NOT NULL,
  CHECK (publish_at <= restrict_from AND restrict_from < restrict_until AND restrict_until <= link_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employment_notice_recipients (
  notice_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (notice_id, user_id),
  KEY idx_employment_notice_user (user_id, notice_id),
  FOREIGN KEY (notice_id) REFERENCES employment_notices(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employment_notice_keys (
  digest BINARY(32) NOT NULL PRIMARY KEY,
  notice_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  channel ENUM('sign_in', 'personal_email') NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY idx_employment_notice_key_expiry (expires_at),
  FOREIGN KEY (notice_id, user_id) REFERENCES employment_notice_recipients(notice_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employment_notice_receipts (
  notice_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  channel ENUM('sign_in', 'personal_email') NOT NULL,
  acknowledgment VARCHAR(350) NOT NULL,
  acknowledged_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (notice_id, user_id),
  FOREIGN KEY (notice_id, user_id) REFERENCES employment_notice_recipients(notice_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employment_notice_automation_audit (
  notice_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  operation VARCHAR(80) NOT NULL,
  automation_identity VARCHAR(255) NOT NULL,
  result JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (notice_id, user_id, operation),
  FOREIGN KEY (notice_id, user_id) REFERENCES employment_notice_recipients(notice_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employment_notice_mail (
  delivery_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  notice_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  personal_email_digest BINARY(32) NOT NULL,
  attempted_at DATETIME(3) NULL,
  accepted_at DATETIME(3) NULL,
  UNIQUE KEY uq_employment_notice_mail (notice_id, user_id),
  FOREIGN KEY (notice_id, user_id) REFERENCES employment_notice_recipients(notice_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
