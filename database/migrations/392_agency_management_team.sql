-- Migration: Agency Management Team
-- Description: Per-agency assignment of platform staff who manage/support that agency.
-- SuperAdmin configures who each agency sees as their management team.
-- Agency users see their team in a circle with presence status.

CREATE TABLE IF NOT EXISTS agency_management_team (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  display_role VARCHAR(80) NULL COMMENT 'Optional label e.g. "Account Manager", "Support Lead"',
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_agency_management_team (agency_id, user_id),
  INDEX idx_agency_management_agency (agency_id),
  INDEX idx_agency_management_user (user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
