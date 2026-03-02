-- Migration: Create agency_departments table for Budget Management
-- Description: Departments are a new classification (not schools/organizations) for budget allocation.

CREATE TABLE IF NOT EXISTS agency_departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(128) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_agency_department_slug (agency_id, slug),
  INDEX idx_agency_departments_agency (agency_id),
  INDEX idx_agency_departments_active (agency_id, is_active),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
