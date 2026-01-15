-- Migration: Create agency_schools linkage table
-- Purpose: Explicitly link an Agency organization to School organizations for billing and scoping

CREATE TABLE IF NOT EXISTS agency_schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_agency_school (agency_id, school_organization_id),
  INDEX idx_agency (agency_id),
  INDEX idx_school (school_organization_id),
  INDEX idx_active (agency_id, is_active)
);

