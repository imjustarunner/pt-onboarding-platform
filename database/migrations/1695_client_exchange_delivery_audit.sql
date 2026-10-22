CREATE TABLE IF NOT EXISTS client_exchange_delivery_runs (
  listing_id BIGINT UNSIGNED PRIMARY KEY,
  agency_id INT NOT NULL,
  evaluated_at DATETIME NULL,
  completed_at DATETIME NULL,
  error_code VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_exchange_run_agency (agency_id, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS client_exchange_match_audits (
  listing_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  matched BOOLEAN NOT NULL DEFAULT FALSE,
  checks_json JSON NOT NULL,
  notification_id INT NULL,
  email_json JSON NULL,
  sms_json JSON NULL,
  evaluated_at DATETIME NOT NULL,
  PRIMARY KEY (listing_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS client_exchange_views (
  listing_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  view_count INT UNSIGNED NOT NULL DEFAULT 1,
  first_viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (listing_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS client_exchange_audit_clients (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  ordinal INT NOT NULL,
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, client_id),
  UNIQUE KEY uq_exchange_pilot_slot (agency_id, ordinal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS client_exchange_audit_reports (
  listing_id BIGINT UNSIGNED NOT NULL,
  report_key VARCHAR(40) NOT NULL,
  status VARCHAR(24) NOT NULL,
  communication_id INT NULL,
  sent_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (listing_id, report_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS unmonitored_mailbox_replies (
  gmail_message_id VARCHAR(255) PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  agency_id INT NULL,
  status VARCHAR(24) NOT NULL,
  communication_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unmonitored_recipient (recipient_email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
