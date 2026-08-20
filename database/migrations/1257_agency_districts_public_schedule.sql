-- Migration 1257: Stable district slugs for public district schedule links

CREATE TABLE IF NOT EXISTS agency_districts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  slug VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_district_slug (agency_id, slug),
  UNIQUE KEY uq_agency_district_name (agency_id, name),
  INDEX idx_agency_districts_agency (agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE school_profiles
  ADD COLUMN district_id INT NULL
  COMMENT 'Stable district link for public schedule URLs'
  AFTER district_name;

ALTER TABLE school_profiles
  ADD INDEX idx_school_profiles_district_id (district_id),
  ADD CONSTRAINT fk_school_profiles_district
    FOREIGN KEY (district_id) REFERENCES agency_districts(id) ON DELETE SET NULL;
