-- Migration: Create icon templates system
-- Description: Allow saving and reusing full sets of organization icon selections

CREATE TABLE IF NOT EXISTS icon_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  scope ENUM('platform', 'agency') NOT NULL,
  agency_id INT NULL,
  created_by_user_id INT NOT NULL,
  is_shared BOOLEAN DEFAULT TRUE COMMENT 'Shared templates are visible across agencies',
  icon_data JSON NOT NULL COMMENT 'Icon ID set for organization (defaults, dashboard actions, notifications, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_scope_agency (scope, agency_id),
  INDEX idx_shared (is_shared)
);

