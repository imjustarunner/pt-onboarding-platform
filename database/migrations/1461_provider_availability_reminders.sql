CREATE TABLE IF NOT EXISTS provider_availability_reminders (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 provider_id INT NOT NULL,
 format ENUM('IN_PERSON','VIRTUAL') NOT NULL,
 is_missing TINYINT(1) NOT NULL DEFAULT 0,
 task_id INT NULL,
 notification_id INT NULL,
 checked_at DATETIME NULL,
 UNIQUE KEY provider_format (agency_id,provider_id,format)
);
