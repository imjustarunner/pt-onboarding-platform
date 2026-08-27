-- Migration 1315: Tutoring Learning OS foundation (Track A)
-- Student subjects, evaluation summaries, academic learning plans, session briefs/notes,
-- skill evidence bridge, and session linkage to subjects.

CREATE TABLE student_subjects (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  subject_key VARCHAR(64) NOT NULL COMMENT 'e.g. reading, mathematics, writing, algebra, study_skills, science',
  subject_label VARCHAR(128) NOT NULL,
  school_grade VARCHAR(32) NULL COMMENT 'Reported school grade',
  instructional_level VARCHAR(64) NULL COMMENT 'Instructional level if different from grade',
  reason_for_tutoring TEXT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'enrollment_started'
    COMMENT 'enrollment_started|baseline_needed|baseline_in_progress|learning_plan_draft|learning_plan_review|active_tutoring|plan_review_due|reassessment|goals_met|maintenance|completed|discharged',
  primary_tutor_user_id INT NULL,
  standards_version_key VARCHAR(64) NULL COMMENT 'CAS version attached to this track',
  package_subscription_id INT NULL,
  metadata_json JSON NULL,
  enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_student_subjects_client (client_id),
  KEY idx_student_subjects_agency (agency_id),
  KEY idx_student_subjects_status (status),
  KEY idx_student_subjects_tutor (primary_tutor_user_id),
  CONSTRAINT fk_student_subjects_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_subjects_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_subjects_tutor
    FOREIGN KEY (primary_tutor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE evaluation_summaries (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  evaluation_path VARCHAR(32) NOT NULL DEFAULT 'quick'
    COMMENT 'quick|full|external|manual_baseline',
  evaluation_type VARCHAR(64) NULL COMMENT 'baseline|probe|reassessment|external',
  administered_at DATETIME NULL,
  administered_by_user_id INT NULL,
  grade_at_eval VARCHAR(32) NULL,
  strengths_json JSON NULL,
  needs_json JSON NULL,
  skill_map_json JSON NULL COMMENT 'Structured skill ratings from evaluation',
  narrative_summary TEXT NULL,
  external_source_label VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    COMMENT 'draft|in_progress|completed|superseded',
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eval_summaries_subject (student_subject_id),
  KEY idx_eval_summaries_client (client_id),
  CONSTRAINT fk_eval_summaries_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_summaries_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_summaries_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE student_learning_plans (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  evaluation_summary_id INT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    COMMENT 'draft|pending_review|active|superseded|archived',
  strengths_json JSON NULL,
  priority_needs_json JSON NULL,
  instructional_strategies_json JSON NULL,
  progress_monitoring_plan_json JSON NULL,
  standards_version_key VARCHAR(64) NULL,
  parent_summary TEXT NULL,
  approved_at DATETIME NULL,
  approved_by_user_id INT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  ai_artifact_id INT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_slp_subject (student_subject_id),
  KEY idx_slp_client (client_id),
  KEY idx_slp_status (status),
  CONSTRAINT fk_slp_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_slp_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_slp_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_slp_eval
    FOREIGN KEY (evaluation_summary_id) REFERENCES evaluation_summaries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE student_learning_plan_goals (
  id INT NOT NULL AUTO_INCREMENT,
  learning_plan_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  learning_goal_id INT NULL COMMENT 'Optional link to learning_goals row',
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  skill_key VARCHAR(128) NULL,
  skill_label VARCHAR(255) NULL,
  baseline_text VARCHAR(512) NULL,
  success_criteria TEXT NULL,
  measurement_method VARCHAR(128) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'not_assessed'
    COMMENT 'not_assessed|emerging|developing|nearly_secure|secure|generalized|needs_review|mastered',
  sort_order INT NOT NULL DEFAULT 0,
  standards_refs_json JSON NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_slpg_plan (learning_plan_id),
  KEY idx_slpg_subject (student_subject_id),
  CONSTRAINT fk_slpg_plan
    FOREIGN KEY (learning_plan_id) REFERENCES student_learning_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_slpg_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE student_learning_plan_objectives (
  id INT NOT NULL AUTO_INCREMENT,
  plan_goal_id INT NOT NULL,
  learning_plan_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'not_started'
    COMMENT 'not_started|in_progress|met|discontinued',
  sort_order INT NOT NULL DEFAULT 0,
  target_date DATE NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_slpo_goal (plan_goal_id),
  KEY idx_slpo_plan (learning_plan_id),
  CONSTRAINT fk_slpo_goal
    FOREIGN KEY (plan_goal_id) REFERENCES student_learning_plan_goals(id) ON DELETE CASCADE,
  CONSTRAINT fk_slpo_plan
    FOREIGN KEY (learning_plan_id) REFERENCES student_learning_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE academic_skill_evidence (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  learning_plan_id INT NULL,
  plan_goal_id INT NULL,
  learning_evidence_id INT NULL COMMENT 'Bridge to learning_evidence when present',
  session_id INT NULL COMMENT 'learning_class_sessions.id',
  session_note_id INT NULL,
  evidence_type VARCHAR(64) NOT NULL DEFAULT 'session_observation'
    COMMENT 'session_observation|probe|evaluation|assignment|tutor_rating',
  skill_key VARCHAR(128) NULL,
  skill_label VARCHAR(255) NULL,
  rating VARCHAR(40) NULL
    COMMENT 'emerging|developing|nearly_secure|secure|generalized|needs_review',
  score_value DECIMAL(10, 2) NULL,
  notes TEXT NULL,
  observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by_user_id INT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ase_subject (student_subject_id),
  KEY idx_ase_client (client_id),
  KEY idx_ase_session (session_id),
  KEY idx_ase_goal (plan_goal_id),
  CONSTRAINT fk_ase_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ase_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_ase_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_session_briefs (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  learning_plan_id INT NULL,
  session_id INT NULL COMMENT 'learning_class_sessions.id',
  focus_goal_ids_json JSON NULL,
  planned_activities_json JSON NULL,
  materials_json JSON NULL,
  prior_session_recap TEXT NULL,
  tutor_prep_notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    COMMENT 'draft|accepted|modified|tutor_own|completed',
  generated_by VARCHAR(32) NOT NULL DEFAULT 'system'
    COMMENT 'system|ai|tutor',
  ai_artifact_id INT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tsb_session (session_id),
  KEY idx_tsb_subject (student_subject_id),
  CONSTRAINT fk_tsb_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tsb_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_tsb_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_session_notes (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  learning_plan_id INT NULL,
  session_id INT NULL COMMENT 'learning_class_sessions.id',
  session_brief_id INT NULL,
  attendance_status VARCHAR(32) NULL COMMENT 'present|late|absent|cancelled|partial',
  session_type VARCHAR(32) NULL COMMENT 'virtual|in_person|hybrid|evaluation|general_support',
  how_it_went_json JSON NULL,
  evidence_chips_json JSON NULL,
  strengths_observed TEXT NULL,
  challenges_observed TEXT NULL,
  summary TEXT NULL,
  next_steps TEXT NULL,
  homework TEXT NULL,
  general_support TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = homework/general support; may omit goal link',
  parent_update_draft TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    COMMENT 'draft|saved|progress_updated',
  saved_at DATETIME NULL,
  saved_by_user_id INT NULL,
  ai_artifact_id INT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tsn_session (session_id),
  KEY idx_tsn_subject (student_subject_id),
  CONSTRAINT fk_tsn_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tsn_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_tsn_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_tsn_brief
    FOREIGN KEY (session_brief_id) REFERENCES tutoring_session_briefs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE learning_class_sessions
  ADD COLUMN student_subject_id INT NULL
    COMMENT 'Learning OS subject track for this tutoring session'
    AFTER learning_class_id,
  ADD COLUMN learning_plan_id INT NULL
    COMMENT 'Active student_learning_plans.id at session time'
    AFTER student_subject_id,
  ADD KEY idx_lcs_student_subject (student_subject_id),
  ADD KEY idx_lcs_learning_plan (learning_plan_id);
