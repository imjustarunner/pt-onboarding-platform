CREATE TABLE IF NOT EXISTS school_session_email_preferences (
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  product ENUM('guardian','auricwell') NOT NULL,
  agency_id INT NULL,
  client_id INT NULL,
  practice_id CHAR(36) NULL,
  patient_id CHAR(36) NULL,
  recipient_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  disabled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_session_email_opt_out_tokens (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_school_email_scope (scope_key),
  INDEX idx_school_email_expiry (expires_at),
  CONSTRAINT fk_school_email_opt_out_scope FOREIGN KEY (scope_key)
    REFERENCES school_session_email_preferences(scope_key)
);
