-- Migration 986: first-class user work schedules (reachability / notifications)
-- Distinct from virtual booking hours. Do not revive dropped provider_work_schedule_blocks.

CREATE TABLE IF NOT EXISTS user_work_schedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  agency_id INT UNSIGNED NULL DEFAULT NULL COMMENT 'Optional tenant scope; NULL = personal default',
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_work_schedules_user_agency (user_id, agency_id),
  KEY idx_user_work_schedules_user (user_id),
  KEY idx_user_work_schedules_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_work_schedule_blocks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL COMMENT '0=Sunday .. 6=Saturday',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_work_schedule_blocks_schedule (schedule_id),
  CONSTRAINT fk_user_work_schedule_blocks_schedule
    FOREIGN KEY (schedule_id) REFERENCES user_work_schedules (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_preferences
  ADD COLUMN allow_notifications_outside_work_schedule TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, email/SMS may deliver outside work schedule (quiet hours still apply if enabled)';
