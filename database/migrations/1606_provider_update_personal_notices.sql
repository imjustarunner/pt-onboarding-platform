CREATE TABLE IF NOT EXISTS provider_update_personal_notices (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 work_send_id INT NOT NULL,
 agency_id INT NOT NULL,
 user_id INT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'queued',
 communication_id INT NULL,
 error_message VARCHAR(500) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY one_notice_per_invitation (work_send_id),
 KEY pending_personal_notices (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
