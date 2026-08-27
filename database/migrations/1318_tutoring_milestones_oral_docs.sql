-- Migration 1318: Tutoring package academic milestones + oral reading probes (Phases 5–6)

CREATE TABLE tutoring_package_milestones (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  subscription_id INT NULL COMMENT 'learning_subscriptions.id when applicable',
  milestone_type VARCHAR(64) NOT NULL
    COMMENT 'baseline|probe|reassessment|plan_review|goal_check',
  due_after_session_count INT NULL,
  due_on DATE NULL,
  session_id INT NULL COMMENT 'Reserved or completed learning_class_sessions.id',
  status VARCHAR(32) NOT NULL DEFAULT 'planned'
    COMMENT 'planned|scheduled|completed|skipped|cancelled',
  notes TEXT NULL,
  completed_at DATETIME NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tpm_subject (student_subject_id),
  KEY idx_tpm_status (status),
  CONSTRAINT fk_tpm_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tpm_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_tpm_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_oral_reading_probes (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  evaluation_summary_id INT NULL,
  session_id INT NULL,
  passage_title VARCHAR(255) NULL,
  passage_text MEDIUMTEXT NULL,
  words_correct INT NULL,
  words_total INT NULL,
  errors_json JSON NULL,
  wpm DECIMAL(10, 2) NULL,
  accuracy_pct DECIMAL(5, 2) NULL,
  stt_transcript LONGTEXT NULL,
  stt_draft_scores_json JSON NULL,
  tutor_verified TINYINT(1) NOT NULL DEFAULT 0,
  tutor_verified_by_user_id INT NULL,
  tutor_verified_at DATETIME NULL,
  audio_retained TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Off by default per privacy guidance',
  notes TEXT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_torp_subject (student_subject_id),
  KEY idx_torp_eval (evaluation_summary_id),
  CONSTRAINT fk_torp_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_torp_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_torp_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_document_extractions (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NULL,
  source_label VARCHAR(255) NULL COMMENT 'report_card|map|i_ready|cmas|other',
  source_document_id INT NULL,
  raw_text_excerpt MEDIUMTEXT NULL,
  extracted_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_confirm'
    COMMENT 'pending_confirm|confirmed|rejected',
  confirmed_by_user_id INT NULL,
  confirmed_at DATETIME NULL,
  ai_artifact_id INT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tde_client (client_id),
  KEY idx_tde_subject (student_subject_id),
  CONSTRAINT fk_tde_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tde_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
