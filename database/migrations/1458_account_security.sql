CREATE TABLE IF NOT EXISTS account_mfa (
  user_id INT NOT NULL PRIMARY KEY,
  secret_cipher TEXT NULL,
  enabled_at DATETIME(3) NULL,
  factor_version INT NOT NULL DEFAULT 1,
  last_counter BIGINT NULL,
  pending_cipher TEXT NULL,
  pending_session CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  pending_expires_at DATETIME(3) NULL,
  recovery_hashes JSON NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS account_mfa_devices (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  factor_version INT NOT NULL,
  label VARCHAR(100) NOT NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  UNIQUE KEY uq_mfa_device_token (token_hash),
  KEY idx_mfa_device_user (user_id, expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS account_mfa_sessions (
  session_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id INT NOT NULL,
  factor_version INT NOT NULL,
  verified_at DATETIME(3) NOT NULL,
  device_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  KEY idx_mfa_session_user (user_id)
) ENGINE=InnoDB;

-- Login metadata remains available even if the browser never sends a logout.
ALTER TABLE auth_session_security ADD COLUMN session_ref CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE auth_session_security ADD COLUMN started_at DATETIME(3) NULL;
ALTER TABLE auth_session_security ADD COLUMN client_ip VARCHAR(45) NULL;
ALTER TABLE auth_session_security ADD COLUMN ip_source VARCHAR(48) NULL;
ALTER TABLE auth_session_security ADD COLUMN user_agent VARCHAR(512) NULL;
ALTER TABLE auth_session_security ADD COLUMN end_reason VARCHAR(32) NULL;
ALTER TABLE auth_session_security ADD INDEX idx_session_security_ref (user_id, session_ref);
