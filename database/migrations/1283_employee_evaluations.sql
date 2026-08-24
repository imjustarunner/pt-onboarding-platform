-- Migration 1283: Semiannual employee evaluation templates, cycles, and responses

CREATE TABLE IF NOT EXISTS employee_evaluation_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  slug VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'Stable key within agency, e.g. mental_health_counselor',
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  version INT NOT NULL DEFAULT 1,
  rubric_json JSON NOT NULL
    COMMENT 'sections[], ratingScale, reflectionPrompts[]',
  is_supervisor_rubric TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_eval_tpl_agency_slug_version (agency_id, slug, version),
  INDEX idx_eval_tpl_agency_active (agency_id, is_active),
  CONSTRAINT fk_eval_tpl_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_tpl_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hiring_job_evaluation_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  job_description_id INT NOT NULL,
  template_id INT NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hjet_job_template (job_description_id, template_id),
  INDEX idx_hjet_agency_job (agency_id, job_description_id),
  CONSTRAINT fk_hjet_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_hjet_job FOREIGN KEY (job_description_id) REFERENCES hiring_job_descriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_hjet_template FOREIGN KEY (template_id) REFERENCES employee_evaluation_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_evaluation_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  employee_user_id INT NOT NULL,
  initiated_by_user_id INT NULL,
  period_year SMALLINT NOT NULL,
  period_half ENUM('H1', 'H2') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  status ENUM(
    'scheduled',
    'in_progress',
    'submitted',
    'reviewed',
    'closed',
    'cancelled'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  schedule_event_id INT NULL,
  job_description_id INT NULL,
  job_title_snapshot VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  template_snapshot_json JSON NULL
    COMMENT 'Array of attached templates with rubric_json snapshotted at assignment',
  due_at DATETIME NULL,
  assigned_task_id INT NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  closed_at DATETIME NULL,
  admin_comments TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  final_snapshot_json JSON NULL
    COMMENT 'Immutable copy of responses at close',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_eval_cycle_employee_period (agency_id, employee_user_id, period_year, period_half),
  INDEX idx_eval_cycle_employee (employee_user_id, status),
  INDEX idx_eval_cycle_agency_status (agency_id, status),
  INDEX idx_eval_cycle_event (schedule_event_id),
  CONSTRAINT fk_eval_cycle_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_cycle_employee FOREIGN KEY (employee_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_cycle_initiated_by FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_eval_cycle_job FOREIGN KEY (job_description_id) REFERENCES hiring_job_descriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_evaluation_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  template_id INT NULL
    COMMENT 'Source template id at assignment time; may be null if template deleted',
  template_slug VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  template_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  is_supervisor_rubric TINYINT(1) NOT NULL DEFAULT 0,
  rubric_snapshot_json JSON NOT NULL,
  ratings_json JSON NULL
    COMMENT 'Map of criterionKey -> { rating: 1-4, comment?: string }',
  section_action_items_json JSON NULL
    COMMENT 'Map of sectionKey -> string (action items text)',
  reflection_json JSON NULL
    COMMENT 'Map of promptKey -> string',
  status ENUM('draft', 'submitted') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  submitted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_eval_response_cycle_slug (cycle_id, template_slug),
  INDEX idx_eval_response_cycle (cycle_id),
  CONSTRAINT fk_eval_response_cycle FOREIGN KEY (cycle_id) REFERENCES employee_evaluation_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_response_template FOREIGN KEY (template_id) REFERENCES employee_evaluation_templates(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_evaluation_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  actor_user_id INT NULL,
  event_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'assigned|draft_saved|submitted|admin_comment|reopened|closed|cancelled',
  detail_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eval_activity_cycle (cycle_id, created_at),
  CONSTRAINT fk_eval_activity_cycle FOREIGN KEY (cycle_id) REFERENCES employee_evaluation_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_activity_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
