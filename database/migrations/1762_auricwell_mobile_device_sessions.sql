-- Separate durable device sign-in from short-lived, scoped Quick View access.
-- Raw authorization/device/session tokens and quick access codes are never stored.
CREATE TABLE IF NOT EXISTS mobile_authorization_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  client_id VARCHAR(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  redirect_uri VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  code_challenge CHAR(43) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  account_fingerprint CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mobile_authorization_hash (code_hash),
  INDEX ix_mobile_authorization_expiry (expires_at),
  CONSTRAINT fk_mobile_authorization_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mobile_authorization_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mobile_device_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  token_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  account_fingerprint CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  client_id VARCHAR(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  device_name VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  quick_code_hash VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  code_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  revoked_at DATETIME NULL,
  last_used_at DATETIME NOT NULL,
  enrolled_at DATETIME NOT NULL,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  chat_cursor BIGINT UNSIGNED NULL,
  email_cursor BIGINT UNSIGNED NULL,
  sms_cursor BIGINT UNSIGNED NULL,
  push_token VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  push_environment VARCHAR(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  web_push_subscription JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mobile_device_token_hash (token_hash),
  INDEX ix_mobile_device_user (user_id, revoked_at),
  CONSTRAINT fk_mobile_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mobile_device_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE quick_view_sessions
  ADD COLUMN mobile_device_session_id BIGINT UNSIGNED NULL,
  ADD INDEX ix_quick_view_mobile_device (mobile_device_session_id),
  ADD CONSTRAINT fk_quick_view_mobile_device FOREIGN KEY (mobile_device_session_id)
    REFERENCES mobile_device_sessions(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS mobile_push_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_session_id BIGINT UNSIGNED NOT NULL,
  source_kind VARCHAR(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_until DATETIME NULL,
  skipped_at DATETIME NULL,
  delivered_at DATETIME NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NULL,
  last_error VARCHAR(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  UNIQUE KEY uq_mobile_push_delivery (device_session_id, source_kind, source_id),
  CONSTRAINT fk_mobile_push_device FOREIGN KEY (device_session_id) REFERENCES mobile_device_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
