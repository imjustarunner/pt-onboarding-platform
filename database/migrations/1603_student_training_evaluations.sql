-- Quarterly supervisor evaluations using the versioned Appendix G rubric.
-- Independent of semiannual employee self-assessments.
CREATE TABLE IF NOT EXISTS student_training_evaluations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  student_user_id INT NOT NULL,
  evaluator_user_id INT NOT NULL,
  period_year SMALLINT NOT NULL,
  period_quarter TINYINT NOT NULL,
  status ENUM('draft', 'submitted') NOT NULL DEFAULT 'draft',
  template_snapshot_json JSON NOT NULL,
  response_json JSON NOT NULL,
  total_score SMALLINT NULL,
  outcome VARCHAR(80) NULL,
  revision INT NOT NULL DEFAULT 1,
  submitted_by_user_id INT NULL,
  submitted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_training_evaluation_period (agency_id, student_user_id, period_year, period_quarter),
  INDEX idx_training_evaluator (agency_id, evaluator_user_id, status),
  CONSTRAINT fk_training_eval_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_training_eval_student FOREIGN KEY (student_user_id) REFERENCES users(id),
  CONSTRAINT fk_training_eval_evaluator FOREIGN KEY (evaluator_user_id) REFERENCES users(id),
  CONSTRAINT fk_training_eval_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_training_evaluation_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evaluation_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  action ENUM('created', 'draft_saved', 'submitted') NOT NULL,
  revision INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_training_eval_activity (evaluation_id, id),
  CONSTRAINT fk_training_activity_evaluation FOREIGN KEY (evaluation_id) REFERENCES student_training_evaluations(id),
  CONSTRAINT fk_training_activity_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
