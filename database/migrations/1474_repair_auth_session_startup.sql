-- The former bootstrap splitter broke migration 1452 at a quoted semicolon.
-- It also ignored missing-table errors in 1458 and could mark that migration
-- successful without its columns. Repair additively; never reset session data.
CREATE TABLE IF NOT EXISTS auth_session_security (
  session_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id INT NULL,
  last_activity_at DATETIME(3) NOT NULL,
  locked_at DATETIME(3) NULL,
  absolute_expires_at BIGINT NOT NULL,
  revoked_at DATETIME(3) NULL,
  failed_pin_attempts INT NOT NULL DEFAULT 0,
  INDEX idx_session_security_user (user_id),
  INDEX idx_session_security_expiry (absolute_expires_at)
);
ALTER TABLE auth_session_security ADD COLUMN session_ref CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE auth_session_security ADD COLUMN started_at DATETIME(3) NULL;
ALTER TABLE auth_session_security ADD COLUMN client_ip VARCHAR(45) NULL;
ALTER TABLE auth_session_security ADD COLUMN ip_source VARCHAR(48) NULL;
ALTER TABLE auth_session_security ADD COLUMN user_agent VARCHAR(512) NULL;
ALTER TABLE auth_session_security ADD COLUMN end_reason VARCHAR(32) NULL;
ALTER TABLE auth_session_security ADD INDEX idx_session_security_ref (user_id, session_ref);
