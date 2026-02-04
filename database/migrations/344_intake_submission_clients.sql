-- Track multiple clients per intake submission
CREATE TABLE IF NOT EXISTS intake_submission_clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  intake_submission_id INT NOT NULL,
  client_id INT NULL,
  full_name VARCHAR(255) NULL,
  initials VARCHAR(32) NULL,
  contact_phone VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (intake_submission_id) REFERENCES intake_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  INDEX idx_intake_submission_clients (intake_submission_id)
);

ALTER TABLE intake_submission_documents
  ADD COLUMN client_id INT NULL AFTER intake_submission_id,
  ADD INDEX idx_intake_submission_doc_client (client_id),
  ADD CONSTRAINT fk_intake_submission_doc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
