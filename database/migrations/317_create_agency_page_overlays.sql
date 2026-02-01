-- Migration: Create agency_page_overlays
-- Description: Store per-organization (agency/school) published UI overlays like tutorials and helper widget configs

CREATE TABLE IF NOT EXISTS agency_page_overlays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  route_name VARCHAR(128) NOT NULL,
  overlay_type ENUM('tutorial', 'helper') NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  config JSON NOT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_agency_route_type (agency_id, route_name, overlay_type),
  INDEX idx_agency_route (agency_id, route_name),
  INDEX idx_agency_type (agency_id, overlay_type),

  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

