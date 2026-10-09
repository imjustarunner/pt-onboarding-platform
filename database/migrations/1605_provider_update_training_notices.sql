-- A saved guide revision is announced once per assigned recipient, including completed updates.
CREATE TABLE IF NOT EXISTS provider_update_training_notices (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 push_id INT NOT NULL,
 recipient_id INT NOT NULL,
 agency_id INT NOT NULL,
 section_key VARCHAR(80) NOT NULL,
 revision_hash CHAR(64) NOT NULL,
 guide_titles_json JSON NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'queued',
 communication_id INT NULL,
 error_message VARCHAR(500) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY unique_training_notice (recipient_id, section_key, revision_hash),
 KEY training_notice_dispatch (push_id, section_key, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
