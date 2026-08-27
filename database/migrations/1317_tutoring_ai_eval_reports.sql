-- Migration 1317: Tutoring AI artifacts, evaluation engine, progress reports (Phases 3–5)

CREATE TABLE tutoring_ai_artifacts (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NULL,
  student_subject_id INT NULL,
  artifact_type VARCHAR(64) NOT NULL
    COMMENT 'learning_plan_draft|session_brief|session_summary|parent_update|next_step|plan_review|evaluation_interpretation',
  model_name VARCHAR(128) NULL,
  prompt_version VARCHAR(64) NULL,
  input_ref_json JSON NULL,
  retrieved_sources_json JSON NULL,
  draft_content_json JSON NULL,
  draft_text LONGTEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    COMMENT 'draft|approved|rejected|superseded',
  approved_at DATETIME NULL,
  approved_by_user_id INT NULL,
  superseded_by_id INT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tai_agency (agency_id),
  KEY idx_tai_client (client_id),
  KEY idx_tai_subject (student_subject_id),
  KEY idx_tai_type_status (artifact_type, status),
  CONSTRAINT fk_tai_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_evaluation_items (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NULL COMMENT 'NULL = global/shared bank item',
  subject_key VARCHAR(64) NOT NULL,
  skill_key VARCHAR(128) NOT NULL,
  skill_label VARCHAR(255) NULL,
  grade_band VARCHAR(32) NULL,
  item_type VARCHAR(64) NOT NULL DEFAULT 'multiple_choice'
    COMMENT 'multiple_choice|constructed_response|oral_reading|writing_sample|rubric|true_false',
  prompt_text TEXT NOT NULL,
  choices_json JSON NULL,
  correct_answer_json JSON NULL,
  rubric_json JSON NULL,
  misconception_tags_json JSON NULL,
  difficulty TINYINT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    COMMENT 'draft|active|retired',
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tei_subject_skill (subject_key, skill_key),
  KEY idx_tei_agency (agency_id),
  KEY idx_tei_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_evaluation_responses (
  id INT NOT NULL AUTO_INCREMENT,
  evaluation_summary_id INT NOT NULL,
  item_id INT NULL,
  prompt_snapshot TEXT NULL,
  response_json JSON NULL,
  score_value DECIMAL(10, 2) NULL,
  rating VARCHAR(40) NULL,
  misconception_tags_json JSON NULL,
  tutor_verified TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ter_eval (evaluation_summary_id),
  KEY idx_ter_item (item_id),
  CONSTRAINT fk_ter_eval
    FOREIGN KEY (evaluation_summary_id) REFERENCES evaluation_summaries(id) ON DELETE CASCADE,
  CONSTRAINT fk_ter_item
    FOREIGN KEY (item_id) REFERENCES tutoring_evaluation_items(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_progress_alerts (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  alert_type VARCHAR(64) NOT NULL
    COMMENT 'breakthrough|plateau|regression|goal_mismatch|reassessment_due|plan_review_due',
  severity VARCHAR(16) NOT NULL DEFAULT 'medium',
  title VARCHAR(255) NOT NULL,
  detail TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open'
    COMMENT 'open|acknowledged|resolved|dismissed',
  related_goal_id INT NULL,
  acknowledged_by_user_id INT NULL,
  acknowledged_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tpa_subject (student_subject_id),
  KEY idx_tpa_status (status),
  CONSTRAINT fk_tpa_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tpa_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_tpa_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_progress_reports (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  student_subject_id INT NOT NULL,
  learning_plan_id INT NULL,
  report_type VARCHAR(64) NOT NULL
    COMMENT 'after_session|multi_session|plan_review|school_partner|parent_summary',
  title VARCHAR(255) NOT NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  content_json JSON NULL,
  content_html MEDIUMTEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    COMMENT 'draft|published|shared|archived',
  session_note_id INT NULL,
  ai_artifact_id INT NULL,
  published_at DATETIME NULL,
  published_by_user_id INT NULL,
  shared_with_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tpr_subject (student_subject_id),
  KEY idx_tpr_client (client_id),
  KEY idx_tpr_type (report_type),
  CONSTRAINT fk_tpr_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tpr_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_tpr_subject
    FOREIGN KEY (student_subject_id) REFERENCES student_subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tutoring_cas_standards (
  id INT NOT NULL AUTO_INCREMENT,
  version_key VARCHAR(64) NOT NULL,
  subject_key VARCHAR(64) NOT NULL,
  grade_band VARCHAR(32) NULL,
  standard_code VARCHAR(64) NOT NULL,
  title VARCHAR(512) NOT NULL,
  description TEXT NULL,
  evidence_outcomes_json JSON NULL,
  source_label VARCHAR(255) NULL DEFAULT 'Colorado Academic Standards',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cas_version_code (version_key, standard_code),
  KEY idx_cas_subject (subject_key, grade_band)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed a minimal CAS subset for tutoring alignment (illustrative, versioned)
INSERT INTO tutoring_cas_standards
  (version_key, subject_key, grade_band, standard_code, title, description, source_label)
VALUES
  ('CAS-RW-2024', 'reading', '3-5', 'RW.3.2.1', 'Main idea and supporting details',
   'Determine the main idea of a text and explain how key details support it.', 'Colorado Academic Standards — RWC'),
  ('CAS-RW-2024', 'reading', '3-5', 'RW.3.2.2', 'Inferencing from text evidence',
   'Use text evidence to support inferences and conclusions.', 'Colorado Academic Standards — RWC'),
  ('CAS-RW-2024', 'reading', '6-8', 'RW.6.2.1', 'Central idea and development',
   'Determine a central idea and analyze its development over the course of a text.', 'Colorado Academic Standards — RWC'),
  ('CAS-MA-2018', 'mathematics', '3-5', 'MA.4.NF.A', 'Fraction equivalence and ordering',
   'Extend understanding of fraction equivalence and ordering.', 'Colorado Academic Standards — Mathematics'),
  ('CAS-MA-2018', 'mathematics', '3-5', 'MA.5.NF.B', 'Fraction operations',
   'Apply and extend previous understandings of multiplication and division to multiply and divide fractions.', 'Colorado Academic Standards — Mathematics'),
  ('CAS-MA-2018', 'mathematics', '6-8', 'MA.6.RP.A', 'Ratios and proportional relationships',
   'Understand ratio concepts and use ratio reasoning to solve problems.', 'Colorado Academic Standards — Mathematics'),
  ('CAS-MA-2026', 'algebra', '9-12', 'MA.HS.A-REI.A', 'Equations and inequalities',
   'Understand solving equations as a process of reasoning and explain the reasoning.', 'Colorado Academic Standards — Mathematics (2026 HS)'),
  ('CAS-RW-2024', 'writing', '3-5', 'RW.4.3.1', 'Opinion and informative writing',
   'Write opinion and informative/explanatory texts with clear organization and supporting details.', 'Colorado Academic Standards — RWC'),
  ('CAS-RW-2024', 'study_skills', '3-8', 'SS.EF.1', 'Task initiation and organization',
   'Initiate tasks, organize materials, and follow multi-step directions with decreasing support.', 'Internal instructional alignment'),
  ('CAS-SCI-2020', 'science', '6-8', 'SC.MS.PS.1', 'Matter and interactions',
   'Develop models to describe the atomic composition of simple molecules and extended structures.', 'Colorado Academic Standards — Science');

-- Seed starter evaluation items
INSERT INTO tutoring_evaluation_items
  (agency_id, subject_key, skill_key, skill_label, grade_band, item_type, prompt_text, choices_json, correct_answer_json, misconception_tags_json, difficulty, status)
VALUES
  (NULL, 'mathematics', 'fraction_ops', 'Fraction operations', '3-5', 'multiple_choice',
   'What is 1/2 + 1/4?',
   JSON_ARRAY('1/6', '2/6', '3/4', '1/4'),
   JSON_OBJECT('answer', '3/4'),
   JSON_ARRAY('adds_denominators', 'adds_numerators_only'),
   2, 'active'),
  (NULL, 'mathematics', 'fraction_equiv', 'Fraction equivalence', '3-5', 'multiple_choice',
   'Which fraction is equivalent to 2/4?',
   JSON_ARRAY('1/4', '1/2', '2/8', '3/4'),
   JSON_OBJECT('answer', '1/2'),
   JSON_ARRAY('confuses_equivalence_with_operations'),
   1, 'active'),
  (NULL, 'reading', 'main_idea', 'Main idea', '3-5', 'constructed_response',
   'Read the short passage with the student and ask: What is the main idea? Record their response.',
   NULL,
   JSON_OBJECT('rubric', JSON_ARRAY('identifies_main_idea', 'cites_detail')),
   NULL,
   2, 'active'),
  (NULL, 'reading', 'inference', 'Text inference', '3-5', 'constructed_response',
   'Ask the student to make an inference supported by evidence from the passage.',
   NULL,
   JSON_OBJECT('rubric', JSON_ARRAY('inference_stated', 'evidence_cited')),
   NULL,
   3, 'active'),
  (NULL, 'writing', 'organization', 'Writing organization', '3-5', 'rubric',
   'Score a short writing sample for organization (intro, details, conclusion).',
   NULL,
   JSON_OBJECT('levels', JSON_ARRAY('emerging', 'developing', 'nearly_secure', 'secure')),
   NULL,
   2, 'active');
