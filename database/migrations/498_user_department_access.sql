-- Migration: Add department access to user_agencies (Budget Management)
-- Description: Mirror payroll access pattern - has_department_access + user_department_assignments.

ALTER TABLE user_agencies
  ADD COLUMN has_department_access TINYINT(1) NOT NULL DEFAULT 0 AFTER has_payroll_access;

CREATE INDEX idx_user_agencies_department_access
  ON user_agencies (agency_id, has_department_access, user_id);

CREATE TABLE IF NOT EXISTS user_department_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  department_id INT NOT NULL,
  permissions_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_department (user_id, agency_id, department_id),
  INDEX idx_user_department_user (user_id),
  INDEX idx_user_department_agency (agency_id),
  INDEX idx_user_department_department (department_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES agency_departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
