-- Authoritative inactivity deadlines and revocation, shared by all browser tabs.
-- Deploy before the API code; missing security storage fails closed.
CREATE TABLE IF NOT EXISTS auth_session_security (
  session_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id INT NULL COMMENT 'NULL for approved-employee JWTs; session_key binds their signed email/session ID',
  last_activity_at DATETIME(3) NOT NULL,
  locked_at DATETIME(3) NULL,
  absolute_expires_at BIGINT NOT NULL,
  revoked_at DATETIME(3) NULL,
  failed_pin_attempts INT NOT NULL DEFAULT 0,
  INDEX idx_session_security_user (user_id),
  INDEX idx_session_security_expiry (absolute_expires_at)
);
