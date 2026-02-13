-- Migration: Presence + Time Tracker module (SuperAdmin testing)
-- Description: Store per-user presence status for Team Board visibility.
-- One row per user (upsert pattern). Each status update replaces the previous.

CREATE TABLE IF NOT EXISTS user_presence_status (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  status ENUM(
    'in_available',
    'in_heads_down',
    'in_available_for_phone',
    'out_quick',
    'out_am',
    'out_pm',
    'out_full_day',
    'traveling_offsite'
  ) NOT NULL,
  note VARCHAR(255) NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMP NULL,
  expected_return_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_presence_user_id (user_id),
  INDEX idx_presence_status (status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
