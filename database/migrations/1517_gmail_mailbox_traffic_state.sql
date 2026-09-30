CREATE TABLE IF NOT EXISTS gmail_mailbox_traffic_state (
  mailbox_key CHAR(64) NOT NULL PRIMARY KEY,
  blocked_until DATETIME(3) NULL,
  next_request_at DATETIME(3) NULL,
  next_inbound_poll_at DATETIME(3) NULL,
  last_rate_limit_at DATETIME(3) NULL,
  request_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rate_limit_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_method VARCHAR(100) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gmail_inbound_message_retries (
  mailbox_key CHAR(64) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_retry_at DATETIME(3) NOT NULL,
  last_error_code VARCHAR(64) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (mailbox_key,message_id),
  KEY due_retries (next_retry_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
