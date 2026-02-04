-- Migration: Program reminder schedules

CREATE TABLE IF NOT EXISTS program_reminder_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  created_by_user_id INT NULL,
  title VARCHAR(255) NULL,
  message TEXT NOT NULL,
  schedule_type ENUM('once','daily','weekly') NOT NULL,
  schedule_json JSON NULL,
  recipients_json JSON NULL,
  channels_json JSON NULL,
  timezone VARCHAR(64) NULL,
  next_run_at DATETIME NOT NULL,
  last_run_at DATETIME NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_program_reminders_next_run (next_run_at),
  INDEX idx_program_reminders_agency (agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
