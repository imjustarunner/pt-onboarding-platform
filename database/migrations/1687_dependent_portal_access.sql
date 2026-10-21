CREATE TABLE IF NOT EXISTS dependent_portal_access (
 user_id INT NOT NULL PRIMARY KEY,
 client_id INT NOT NULL UNIQUE,
 invited_by_user_id INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_at DATETIME NULL,
 last_invited_at DATETIME NULL
);
CREATE TABLE IF NOT EXISTS dependent_portal_clinical_shares (
 user_id INT NOT NULL,
 agency_id INT NOT NULL,
 scopes_json JSON NOT NULL,
 reviewed_by_user_id INT NOT NULL,
 reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,agency_id)
);
CREATE TABLE IF NOT EXISTS dependent_portal_threads (
 thread_id INT NOT NULL PRIMARY KEY,
 user_id INT NOT NULL,
 client_id INT NOT NULL,
 agency_id INT NOT NULL,
 service_id INT NOT NULL,
 UNIQUE KEY dependent_service_thread(user_id,agency_id,service_id)
);
CREATE TABLE IF NOT EXISTS dependent_portal_events (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 client_id INT NOT NULL,
 user_id INT NULL,
 actor_user_id INT NOT NULL,
 action VARCHAR(60) NOT NULL,
 details_json JSON NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
