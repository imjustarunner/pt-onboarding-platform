/*
Migration 841: Agency public service types.

Each agency can enable one or more public-facing service finder types (counseling, tutoring, etc.).
This table stores per-agency configuration for each enabled service type.
*/

CREATE TABLE agency_public_service_types (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  service_type VARCHAR(32) NOT NULL COMMENT 'counseling | tutoring',
  display_name VARCHAR(128) NOT NULL DEFAULT '' COMMENT 'Override label shown on public pages',
  intro_blurb TEXT NULL COMMENT 'Introductory copy shown at the top of the finder page',
  hero_image_url VARCHAR(512) NULL COMMENT 'Optional hero/banner image URL for the finder page',
  is_enabled TINYINT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0 COMMENT 'Display order on the agency services hub',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agency_service_type (agency_id, service_type),
  KEY idx_agency_public_service_types_agency (agency_id),
  CONSTRAINT fk_agency_public_service_types_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
