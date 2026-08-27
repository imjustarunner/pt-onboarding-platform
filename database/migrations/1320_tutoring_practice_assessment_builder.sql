-- Migration 1320: Tutoring practice assignments + assessment blueprints

CREATE TABLE tutoring_practice_assignments (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  learning_plan_id INT NULL,
  plan_goal_id INT NULL,
  session_id INT NULL,
  session_note_id INT NULL,
  title VARCHAR(255) NOT NULL,
  instructions TEXT NULL,
  practice_items_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'assigned'
    COMMENT 'assigned|in_progress|completed|cancelled',
  due_at DATETIME NULL,
  completed_at DATETIME NULL,
  ai_artifact_id INT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tpa_client (client_id),
  KEY idx_tpa_subject (student_subject_id),
  KEY idx_tpa_status (status),
  CONSTRAINT fk_tprac_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tprac_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_tprac_subject FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_assessment_blueprints (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  student_subject_id INT NULL COMMENT 'NULL = reusable template for agency',
  title VARCHAR(255) NOT NULL,
  subject_key VARCHAR(64) NOT NULL,
  grade_band VARCHAR(32) NULL,
  evaluation_path VARCHAR(32) NOT NULL DEFAULT 'quick'
    COMMENT 'quick|full|probe',
  skill_keys_json JSON NULL,
  item_types_json JSON NULL,
  item_count INT NOT NULL DEFAULT 5,
  difficulty_max TINYINT NULL,
  selected_item_ids_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    COMMENT 'draft|ready|archived',
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tab_agency (agency_id),
  KEY idx_tab_subject (student_subject_id),
  CONSTRAINT fk_tab_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
