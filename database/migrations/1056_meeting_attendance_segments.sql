-- Migration 1056: Meeting completion + attendance segments for payable time
ALTER TABLE provider_schedule_events
  ADD COLUMN meeting_completed_at DATETIME NULL DEFAULT NULL
  COMMENT 'Set when host marks session completed; stops payable attendance accrual';

CREATE TABLE provider_schedule_event_attendance_segments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL DEFAULT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'platform'
    COMMENT 'platform | meet | manual',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pseas_event_user (event_id, user_id),
  KEY idx_pseas_event_open (event_id, ended_at),
  CONSTRAINT fk_pseas_event
    FOREIGN KEY (event_id) REFERENCES provider_schedule_events(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_pseas_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
