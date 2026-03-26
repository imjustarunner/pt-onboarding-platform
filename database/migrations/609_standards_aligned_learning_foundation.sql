-- Standards-aligned learning foundation (additive)
-- Phase 1-4 baseline: standards taxonomy, goals, evidence, assignments, generation, and recommendations.

CREATE TABLE IF NOT EXISTS learning_standards_domains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT NULL,
  source_framework VARCHAR(64) NOT NULL DEFAULT 'CAS',
  version VARCHAR(64) NOT NULL DEFAULT 'v1',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_learning_standards_domains_code_version (code, version),
  INDEX idx_learning_standards_domains_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_standards_subdomains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT NULL,
  source_framework VARCHAR(64) NOT NULL DEFAULT 'CAS',
  version VARCHAR(64) NOT NULL DEFAULT 'v1',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_learning_standards_subdomains_domain_code_version (domain_id, code, version),
  INDEX idx_learning_standards_subdomains_domain (domain_id),
  CONSTRAINT fk_learning_standards_subdomains_domain
    FOREIGN KEY (domain_id) REFERENCES learning_standards_domains(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_standards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  subdomain_id INT NULL,
  code VARCHAR(128) NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT NULL,
  grade_band VARCHAR(64) NULL,
  source_framework VARCHAR(64) NOT NULL DEFAULT 'CAS',
  version VARCHAR(64) NOT NULL DEFAULT 'v1',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_learning_standards_code_version (code, version),
  INDEX idx_learning_standards_domain (domain_id),
  INDEX idx_learning_standards_subdomain (subdomain_id),
  CONSTRAINT fk_learning_standards_domain
    FOREIGN KEY (domain_id) REFERENCES learning_standards_domains(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_standards_subdomain
    FOREIGN KEY (subdomain_id) REFERENCES learning_standards_subdomains(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_skills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  subdomain_id INT NULL,
  standard_id INT NULL,
  code VARCHAR(128) NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT NULL,
  grade_level VARCHAR(64) NULL,
  skill_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_learning_skills_code (code),
  INDEX idx_learning_skills_domain (domain_id),
  INDEX idx_learning_skills_subdomain (subdomain_id),
  INDEX idx_learning_skills_standard (standard_id),
  CONSTRAINT fk_learning_skills_domain
    FOREIGN KEY (domain_id) REFERENCES learning_standards_domains(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_skills_subdomain
    FOREIGN KEY (subdomain_id) REFERENCES learning_standards_subdomains(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_skills_standard
    FOREIGN KEY (standard_id) REFERENCES learning_standards(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  program_context_type ENUM('learning_class','company_event','program_org','agency','custom') NOT NULL DEFAULT 'custom',
  program_context_id INT NULL,
  domain_id INT NOT NULL,
  subdomain_id INT NULL,
  standard_id INT NULL,
  skill_id INT NOT NULL,
  measurement_type ENUM('numeric','rubric') NOT NULL,
  baseline_value DECIMAL(10,4) NULL,
  baseline_rubric_level VARCHAR(64) NULL,
  target_value DECIMAL(10,4) NULL,
  target_rubric_level VARCHAR(64) NULL,
  start_date DATE NOT NULL,
  target_date DATE NOT NULL,
  status ENUM('draft','active','achieved','paused','closed') NOT NULL DEFAULT 'draft',
  notes TEXT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_goals_client (client_id),
  INDEX idx_learning_goals_domain (domain_id),
  INDEX idx_learning_goals_skill (skill_id),
  INDEX idx_learning_goals_status (status),
  CONSTRAINT fk_learning_goals_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_goals_domain
    FOREIGN KEY (domain_id) REFERENCES learning_standards_domains(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_goals_subdomain
    FOREIGN KEY (subdomain_id) REFERENCES learning_standards_subdomains(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_goals_standard
    FOREIGN KEY (standard_id) REFERENCES learning_standards(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_goals_skill
    FOREIGN KEY (skill_id) REFERENCES learning_skills(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_goals_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_goals_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_evidence (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  source_type ENUM('assessment','assignment_submission','evaluation_result','quiz_attempt','module_progress','manual') NOT NULL,
  source_id BIGINT NULL,
  assessment_type ENUM('screening','diagnostic','formative','summative','other') NULL,
  observed_at DATETIME NOT NULL,
  domain_id INT NOT NULL,
  subdomain_id INT NULL,
  standard_id INT NULL,
  skill_id INT NOT NULL,
  score_value DECIMAL(10,4) NULL,
  rubric_level VARCHAR(64) NULL,
  completion_status ENUM('not_started','in_progress','completed','excused') NOT NULL DEFAULT 'completed',
  notes TEXT NULL,
  validity_flag TINYINT(1) NOT NULL DEFAULT 1,
  reliability_flag TINYINT(1) NOT NULL DEFAULT 1,
  confidence_score DECIMAL(5,4) NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_evidence_client_observed (client_id, observed_at),
  INDEX idx_learning_evidence_domain (domain_id),
  INDEX idx_learning_evidence_skill (skill_id),
  INDEX idx_learning_evidence_source (source_type, source_id),
  CONSTRAINT fk_learning_evidence_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_evidence_domain
    FOREIGN KEY (domain_id) REFERENCES learning_standards_domains(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_evidence_subdomain
    FOREIGN KEY (subdomain_id) REFERENCES learning_standards_subdomains(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_evidence_standard
    FOREIGN KEY (standard_id) REFERENCES learning_standards(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_evidence_skill
    FOREIGN KEY (skill_id) REFERENCES learning_skills(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_evidence_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_goal_evidence (
  goal_id INT NOT NULL,
  evidence_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (goal_id, evidence_id),
  CONSTRAINT fk_learning_goal_evidence_goal
    FOREIGN KEY (goal_id) REFERENCES learning_goals(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_goal_evidence_evidence
    FOREIGN KEY (evidence_id) REFERENCES learning_evidence(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_assignments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT NULL,
  domain_id INT NOT NULL,
  subdomain_id INT NULL,
  standard_id INT NULL,
  skill_id INT NOT NULL,
  delivery_method ENUM('at_home','live_session') NOT NULL DEFAULT 'at_home',
  source_type ENUM('uploaded','generated_source_adapted','generated_personalized','manual') NOT NULL DEFAULT 'manual',
  status ENUM('draft','assigned','submitted','evaluated','archived') NOT NULL DEFAULT 'draft',
  assigned_by_user_id INT NULL,
  assigned_at DATETIME NULL,
  due_at DATETIME NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_assignments_client (client_id),
  INDEX idx_learning_assignments_status (status),
  INDEX idx_learning_assignments_domain (domain_id),
  INDEX idx_learning_assignments_skill (skill_id),
  CONSTRAINT fk_learning_assignments_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_assignments_domain
    FOREIGN KEY (domain_id) REFERENCES learning_standards_domains(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_assignments_subdomain
    FOREIGN KEY (subdomain_id) REFERENCES learning_standards_subdomains(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_assignments_standard
    FOREIGN KEY (standard_id) REFERENCES learning_standards(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_assignments_skill
    FOREIGN KEY (skill_id) REFERENCES learning_skills(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_assignments_assigned_by
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_assignment_goals (
  assignment_id BIGINT NOT NULL,
  goal_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assignment_id, goal_id),
  CONSTRAINT fk_learning_assignment_goals_assignment
    FOREIGN KEY (assignment_id) REFERENCES learning_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_assignment_goals_goal
    FOREIGN KEY (goal_id) REFERENCES learning_goals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_assignment_submissions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  assignment_id BIGINT NOT NULL,
  submitted_by_user_id INT NULL,
  submission_mode ENUM('image','typed','instructor_entered') NOT NULL,
  response_text LONGTEXT NULL,
  file_url VARCHAR(1024) NULL,
  metadata_json JSON NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_assignment_submissions_assignment (assignment_id),
  CONSTRAINT fk_learning_assignment_submissions_assignment
    FOREIGN KEY (assignment_id) REFERENCES learning_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_assignment_submissions_submitted_by
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_assignment_evaluations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  assignment_id BIGINT NOT NULL,
  submission_id BIGINT NULL,
  evaluator_user_id INT NULL,
  score_value DECIMAL(10,4) NULL,
  rubric_level VARCHAR(64) NULL,
  completion_status ENUM('not_started','in_progress','completed','excused') NOT NULL DEFAULT 'completed',
  observational_notes TEXT NULL,
  confidence_score DECIMAL(5,4) NULL,
  metadata_json JSON NULL,
  evaluated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_assignment_evaluations_assignment (assignment_id),
  CONSTRAINT fk_learning_assignment_evaluations_assignment
    FOREIGN KEY (assignment_id) REFERENCES learning_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_assignment_evaluations_submission
    FOREIGN KEY (submission_id) REFERENCES learning_assignment_submissions(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_assignment_evaluations_evaluator
    FOREIGN KEY (evaluator_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_generated_content (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  generation_path ENUM('source_based','generative') NOT NULL,
  domain_id INT NOT NULL,
  subdomain_id INT NULL,
  standard_id INT NULL,
  skill_id INT NOT NULL,
  target_grade_level VARCHAR(64) NULL,
  theme VARCHAR(191) NULL,
  source_document_url VARCHAR(1024) NULL,
  request_payload_json JSON NULL,
  output_payload_json JSON NULL,
  status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_generated_content_client (client_id),
  INDEX idx_learning_generated_content_skill (skill_id),
  CONSTRAINT fk_learning_generated_content_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_generated_content_domain
    FOREIGN KEY (domain_id) REFERENCES learning_standards_domains(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_generated_content_subdomain
    FOREIGN KEY (subdomain_id) REFERENCES learning_standards_subdomains(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_generated_content_standard
    FOREIGN KEY (standard_id) REFERENCES learning_standards(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_generated_content_skill
    FOREIGN KEY (skill_id) REFERENCES learning_skills(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_generated_content_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_progress_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  domain_id INT NOT NULL,
  snapshot_at DATETIME NOT NULL,
  trend_window_days INT NOT NULL DEFAULT 30,
  mastery_estimate DECIMAL(5,4) NULL,
  evidence_count INT NOT NULL DEFAULT 0,
  goal_alignment_score DECIMAL(5,4) NULL,
  recommended_next_skill_id INT NULL,
  recommended_difficulty_shift ENUM('decrease','maintain','increase') NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_learning_progress_snapshots_client_domain_time (client_id, domain_id, snapshot_at),
  CONSTRAINT fk_learning_progress_snapshots_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_progress_snapshots_domain
    FOREIGN KEY (domain_id) REFERENCES learning_standards_domains(id) ON DELETE RESTRICT,
  CONSTRAINT fk_learning_progress_snapshots_next_skill
    FOREIGN KEY (recommended_next_skill_id) REFERENCES learning_skills(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
