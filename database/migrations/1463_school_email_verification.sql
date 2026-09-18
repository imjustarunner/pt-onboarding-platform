-- School-staff email verification is session-bound; it never grants authenticator assurance.
CREATE TABLE IF NOT EXISTS account_email_challenges (
 user_id INT NOT NULL PRIMARY KEY,
 challenge_id CHAR(36) NOT NULL,
 session_key CHAR(64) NOT NULL,
 recipient_hash CHAR(64) NOT NULL,
 code_hash CHAR(64) NULL,
 expires_at DATETIME(3) NOT NULL,
 sent_at DATETIME(3) NOT NULL,
 delivery_state VARCHAR(16) NOT NULL DEFAULT 'pending',
 window_started_at DATETIME(3) NOT NULL,
 send_count INT NOT NULL DEFAULT 1,
 failed_attempts INT NOT NULL DEFAULT 0,
 locked_until DATETIME(3) NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS account_email_sessions (
 session_key CHAR(64) NOT NULL PRIMARY KEY,
 user_id INT NOT NULL,
 recipient_hash CHAR(64) NOT NULL,
 verified_at DATETIME(3) NOT NULL,
 INDEX idx_email_session_user (user_id)
) ENGINE=InnoDB;
