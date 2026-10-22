-- Delegated assistance is separate from guardian and clinical record access.
CREATE TABLE IF NOT EXISTS client_portal_independence (
 client_id INT NOT NULL PRIMARY KEY,
 user_id INT NOT NULL,
 status ENUM('requested','active','declined') NOT NULL DEFAULT 'requested',
 version INT NOT NULL DEFAULT 1,
 choices_json JSON NOT NULL,
 requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_by_user_id INT NULL,
 reviewed_at DATETIME NULL,
 authority_basis VARCHAR(40) NULL,
 evidence_encrypted LONGTEXT NULL,
 activated_at DATETIME NULL
);
CREATE TABLE IF NOT EXISTS client_support_grants (
 client_id INT NOT NULL,
 agency_id INT NOT NULL,
 helper_user_id INT NOT NULL,
 scopes_json JSON NOT NULL,
 approved_by_user_id INT NOT NULL,
 approved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_at DATETIME NULL,
 PRIMARY KEY(client_id,agency_id,helper_user_id),
 KEY support_helper(helper_user_id,revoked_at)
);
CREATE TABLE IF NOT EXISTS client_support_requests (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 client_id INT NOT NULL,
 agency_id INT NOT NULL,
 helper_user_id INT NOT NULL,
 scope VARCHAR(30) NOT NULL,
 request_encrypted LONGTEXT NOT NULL,
 status ENUM('pending','resolved','cancelled') NOT NULL DEFAULT 'pending',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at DATETIME NULL,
 resolved_by_user_id INT NULL,
 KEY support_client(client_id,agency_id,status)
);
