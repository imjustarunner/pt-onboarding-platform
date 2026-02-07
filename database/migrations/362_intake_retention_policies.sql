-- Intake retention policies and expiration tracking
ALTER TABLE intake_links
  ADD COLUMN retention_policy_json JSON NULL AFTER intake_steps;

ALTER TABLE intake_submissions
  ADD COLUMN intake_data_hash VARCHAR(128) NULL AFTER intake_data,
  ADD COLUMN retention_expires_at TIMESTAMP NULL AFTER combined_pdf_hash,
  ADD INDEX idx_intake_submission_retention (retention_expires_at);

ALTER TABLE agencies
  ADD COLUMN intake_retention_policy_json JSON NULL AFTER terminology_settings;

ALTER TABLE client_phi_documents
  ADD COLUMN intake_submission_id INT NULL AFTER client_id,
  ADD COLUMN expires_at TIMESTAMP NULL AFTER removed_reason,
  ADD INDEX idx_phi_documents_expires_at (expires_at),
  ADD INDEX idx_phi_documents_intake_submission (intake_submission_id),
  ADD CONSTRAINT fk_phi_documents_intake_submission
    FOREIGN KEY (intake_submission_id) REFERENCES intake_submissions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS platform_retention_settings (
  id INT PRIMARY KEY,
  default_intake_retention_mode ENUM('days', 'never') NOT NULL DEFAULT 'days',
  default_intake_retention_days INT NOT NULL DEFAULT 14,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
