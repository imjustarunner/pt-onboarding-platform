-- Migration: Agency-level notification preferences defaults and locks

CREATE TABLE IF NOT EXISTS agency_notification_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL UNIQUE,
  defaults_json JSON NULL,
  user_editable BOOLEAN DEFAULT TRUE,
  enforce_defaults BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
