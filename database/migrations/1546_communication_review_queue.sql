-- Agency-scoped, encrypted intake for unknown senders and support follow-up.
CREATE TABLE IF NOT EXISTS communication_review_queue (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 number_id INT NULL,
 channel VARCHAR(16) NOT NULL,
 external_id VARCHAR(160) NOT NULL,
 reason VARCHAR(48) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'review',
 from_number VARCHAR(32) NULL,
 to_number VARCHAR(32) NULL,
 body_ciphertext MEDIUMTEXT NULL,
 body_iv VARCHAR(64) NULL,
 body_auth_tag VARCHAR(64) NULL,
 encryption_key_id VARCHAR(100) NULL,
 message_log_id INT NULL,
 voicemail_id INT NULL,
 reviewed_by INT NULL,
 reviewed_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_communication_review_source (agency_id, channel, external_id),
 KEY idx_communication_review_agency (agency_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS communication_blocked_senders (
 agency_id INT NOT NULL,
 phone_number VARCHAR(32) NOT NULL,
 blocked_by INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (agency_id, phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
