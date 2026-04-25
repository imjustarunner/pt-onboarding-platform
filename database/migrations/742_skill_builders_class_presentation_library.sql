-- Migration 742: database-backed class presentation series/session library
CREATE TABLE IF NOT EXISTS skill_builders_class_presentation_series (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  program_organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  updated_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sb_class_presentation_series_scope (agency_id, program_organization_id),
  KEY idx_sb_class_presentation_series_program (program_organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skill_builders_class_presentation_sessions (
  id INT NOT NULL AUTO_INCREMENT,
  series_id INT NOT NULL,
  agency_id INT NOT NULL,
  program_organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NULL,
  event_label VARCHAR(255) NULL DEFAULT NULL,
  position_index INT NOT NULL DEFAULT 0,
  plan_json LONGTEXT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  updated_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sb_class_presentation_sessions_series (series_id, position_index),
  KEY idx_sb_class_presentation_sessions_scope (agency_id, program_organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skill_builders_class_presentation_event_sessions (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  program_organization_id INT NOT NULL,
  company_event_id INT NOT NULL,
  presentation_series_id INT NOT NULL,
  presentation_session_id INT NOT NULL,
  attached_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sb_class_presentation_event (company_event_id),
  KEY idx_sb_class_presentation_event_scope (agency_id, program_organization_id),
  KEY idx_sb_class_presentation_event_series (presentation_series_id),
  KEY idx_sb_class_presentation_event_session (presentation_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
