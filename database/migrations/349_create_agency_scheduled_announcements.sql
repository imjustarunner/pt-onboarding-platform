-- Migration: Agency scheduled announcements (Dashboard banners)
-- Purpose: Create time-limited, schedulable agency announcements (no PHI)

CREATE TABLE IF NOT EXISTS agency_scheduled_announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  title VARCHAR(255) NULL,
  message TEXT NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asa_agency_time (agency_id, starts_at, ends_at),
  INDEX idx_asa_agency_created (agency_id, created_at),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
