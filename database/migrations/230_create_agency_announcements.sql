-- Agency announcements configuration (per-agency).
-- Used for dashboard banners (e.g., birthdays) and future announcement types.

CREATE TABLE IF NOT EXISTS agency_announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  birthday_enabled TINYINT(1) NOT NULL DEFAULT 0,
  birthday_template VARCHAR(255) NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_agency_announcements_agency_id (agency_id),
  INDEX idx_agency_announcements_agency_id (agency_id),
  CONSTRAINT fk_agency_announcements_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

