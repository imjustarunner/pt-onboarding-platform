-- Guardians explicitly opt in only after proving both their password and email.
-- Email codes remain session-bound and never replace an enrolled stronger factor.
CREATE TABLE IF NOT EXISTS account_email_preferences (
 user_id INT NOT NULL PRIMARY KEY,
 enabled_at DATETIME(3) NULL,
 enrollment_challenge_id CHAR(36) NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
