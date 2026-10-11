-- Document editions remain in the reference library; learning records point to
-- the exact edition studied. No document is published or payroll approved here.
CREATE TABLE IF NOT EXISTS company_document_training_reviews (
  agency_id INT NOT NULL,
  document_key VARCHAR(80) NOT NULL,
  version_id INT NOT NULL,
  definition_json JSON NOT NULL,
  revision VARCHAR(64) NOT NULL,
  reviewed_by_user_id INT NOT NULL,
  reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, document_key, version_id)
);
CREATE TABLE IF NOT EXISTS company_document_training_preferences (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  expected_school_work BOOLEAN NOT NULL,
  updated_by_user_id INT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, user_id)
);
CREATE TABLE IF NOT EXISTS company_document_learning (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  document_key VARCHAR(80) NOT NULL,
  version_id INT NOT NULL,
  course_revision VARCHAR(64) NOT NULL,
  definition_json JSON NOT NULL,
  assignment_key VARCHAR(100) NOT NULL,
  purpose ENUM('onboarding','assigned','practice') NOT NULL,
  status ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  read_sections_json JSON NOT NULL,
  assigned_by_user_id INT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY document_learning_assignment (agency_id, user_id, document_key, assignment_key),
  KEY document_learning_user (agency_id, user_id, status)
);
CREATE TABLE IF NOT EXISTS company_document_learning_attempts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  learning_id INT NOT NULL,
  request_key VARCHAR(80) NOT NULL,
  answers_json JSON NOT NULL,
  result_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY document_learning_attempt_request (learning_id, request_key),
  CONSTRAINT document_learning_attempt_parent FOREIGN KEY (learning_id) REFERENCES company_document_learning(id)
);
CREATE TABLE IF NOT EXISTS company_document_learning_activity (
  user_id INT NOT NULL PRIMARY KEY,
  learning_id INT NULL,
  session_id VARCHAR(80) NULL,
  sequence_number INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  seen_at DATETIME(3) NULL
);
CREATE TABLE IF NOT EXISTS company_document_learning_time (
  learning_id INT NOT NULL,
  work_date DATE NOT NULL,
  seconds INT NOT NULL DEFAULT 0,
  submitted_seconds INT NOT NULL DEFAULT 0,
  payroll_claim_ids_json JSON NOT NULL,
  PRIMARY KEY (learning_id, work_date),
  CONSTRAINT document_learning_time_parent FOREIGN KEY (learning_id) REFERENCES company_document_learning(id)
);
