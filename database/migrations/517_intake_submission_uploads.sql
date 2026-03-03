-- Store file uploads from intake upload steps (e.g. resume, cover letter for job applications).
CREATE TABLE IF NOT EXISTS intake_submission_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  intake_submission_id INT NOT NULL,
  step_id VARCHAR(64) NOT NULL COMMENT 'Step id from intake_steps JSON',
  upload_label VARCHAR(255) NULL COMMENT 'e.g. Resume, Cover Letter',
  storage_path VARCHAR(1024) NOT NULL,
  original_filename VARCHAR(512) NULL,
  file_size INT NULL,
  mime_type VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_intake_submission_uploads_submission (intake_submission_id),
  FOREIGN KEY (intake_submission_id) REFERENCES intake_submissions(id) ON DELETE CASCADE
);
