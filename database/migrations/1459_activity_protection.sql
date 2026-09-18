-- Shared, transactional protection state. No role exemptions.
CREATE TABLE IF NOT EXISTS activity_protection_state (
 user_id INT NOT NULL, kind VARCHAR(32) NOT NULL, held_at DATETIME(3) NULL,
 PRIMARY KEY(user_id,kind)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS activity_protection_usage (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, kind VARCHAR(32) NOT NULL,
 resource_ref CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 units INT NOT NULL, occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 request_id CHAR(36) NOT NULL, session_ref CHAR(64) NULL, ticket_id CHAR(36) NULL,
 INDEX usage_user_time(user_id,kind,occurred_at), INDEX usage_resource(user_id,kind,resource_ref,occurred_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS activity_protection_alerts (
 id CHAR(36) PRIMARY KEY, user_id INT NULL, kind VARCHAR(32) NOT NULL, reason VARCHAR(64) NOT NULL,
 request_id CHAR(36) NOT NULL, session_ref CHAR(64) NULL, client_ip VARCHAR(45) NULL,
 ip_source VARCHAR(48) NOT NULL, route VARCHAR(512) NOT NULL, units INT NOT NULL,
 occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 reviewed_at DATETIME(3) NULL, reviewed_by INT NULL, review_note VARCHAR(1000) NULL,
 INDEX alerts_time(occurred_at), INDEX alerts_user(user_id,kind,occurred_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS activity_protection_tickets (
 id CHAR(36) PRIMARY KEY, user_id INT NOT NULL, session_ref CHAR(64) NOT NULL,
 kind VARCHAR(32) NOT NULL, reason VARCHAR(2000) NOT NULL, requested_units INT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending', created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 reviewer_id INT NULL, reviewed_at DATETIME(3) NULL, review_note VARCHAR(1000) NULL,
 expires_at DATETIME(3) NULL, allowed_units INT NOT NULL DEFAULT 0, used_units INT NOT NULL DEFAULT 0,
 INDEX tickets_owner(user_id,kind,status,expires_at), INDEX tickets_queue(status,created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS auth_attempt_windows (
 bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 attempts INT NOT NULL, expires_at DATETIME(3) NOT NULL, INDEX attempt_expiry(expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS privacy_reviewers (
 user_id INT NOT NULL PRIMARY KEY, assigned_by INT NOT NULL,
 assigned_at DATETIME(3) NOT NULL, revoked_at DATETIME(3) NULL
) ENGINE=InnoDB;
