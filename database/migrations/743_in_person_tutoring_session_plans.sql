-- Migration 743: in-person tutoring copilot session plans/materials/responses
ALTER TABLE learning_class_sessions
  ADD COLUMN delivery_context VARCHAR(32) NULL DEFAULT NULL AFTER session_subtype;

CREATE TABLE IF NOT EXISTS learning_class_session_in_person_plans (
  id INT NOT NULL AUTO_INCREMENT,
  session_id INT NOT NULL,
  student_client_id INT NULL DEFAULT NULL,
  student_snapshot_json LONGTEXT NULL,
  subject_area VARCHAR(128) NULL DEFAULT NULL,
  grade_label VARCHAR(64) NULL DEFAULT NULL,
  focus_area VARCHAR(255) NULL DEFAULT NULL,
  goals_json LONGTEXT NULL,
  outline_json LONGTEXT NULL,
  tutor_notes LONGTEXT NULL,
  ai_context_json LONGTEXT NULL,
  layout_prefs_json LONGTEXT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  updated_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_in_person_plan_session (session_id),
  KEY idx_learning_in_person_plan_student (student_client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_class_session_materials (
  id INT NOT NULL AUTO_INCREMENT,
  session_id INT NOT NULL,
  material_type VARCHAR(32) NOT NULL,
  source_id INT NULL DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  position_index INT NOT NULL DEFAULT 0,
  storage_path VARCHAR(512) NULL DEFAULT NULL,
  external_url VARCHAR(1024) NULL DEFAULT NULL,
  mime_type VARCHAR(128) NULL DEFAULT NULL,
  file_size_bytes BIGINT NULL DEFAULT NULL,
  config_json LONGTEXT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  updated_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_learning_session_materials_session (session_id, position_index),
  KEY idx_learning_session_materials_type (material_type),
  KEY idx_learning_session_materials_source (source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_class_session_material_responses (
  id INT NOT NULL AUTO_INCREMENT,
  session_id INT NOT NULL,
  session_material_id INT NOT NULL,
  client_id INT NOT NULL,
  response_values LONGTEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  started_at DATETIME NULL DEFAULT NULL,
  completed_at DATETIME NULL DEFAULT NULL,
  last_saved_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_session_material_response (session_material_id, client_id),
  KEY idx_learning_session_material_response_session (session_id),
  KEY idx_learning_session_material_response_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
