-- Durable notices for newly approved manual records and attendance corrections.
-- No historical records are queued by this migration.
CREATE TABLE IF NOT EXISTS meeting_record_notification_jobs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 meeting_type ENUM('team','supervision') NOT NULL,
 meeting_id BIGINT UNSIGNED NOT NULL,
 notice_kind ENUM('manual','correction') NOT NULL,
 source_id BIGINT UNSIGNED NOT NULL,
 actor_user_id INT NOT NULL,
 completed_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_record_notice (meeting_type,notice_kind,source_id),
 KEY idx_record_notice_pending (completed_at,id)
) ENGINE=InnoDB;
