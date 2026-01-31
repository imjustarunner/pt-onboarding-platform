-- Store extracted resume text/fields for hiring workflow.
-- Cheapest path: extract text from uploaded PDFs that contain selectable text.
-- Future: add OCR/Document AI outputs in extracted_json.

CREATE TABLE IF NOT EXISTS hiring_resume_parses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidate_user_id INT NOT NULL,
  resume_doc_id INT NOT NULL,
  method VARCHAR(40) NOT NULL DEFAULT 'pdf_text',
  status ENUM('pending', 'completed', 'no_text', 'failed') NOT NULL DEFAULT 'pending',
  extracted_text MEDIUMTEXT NULL,
  extracted_json JSON NULL,
  error_text VARCHAR(1000) NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hiring_resume_parses_resume_doc_id (resume_doc_id),
  KEY idx_hiring_resume_parses_candidate_user_id (candidate_user_id),
  KEY idx_hiring_resume_parses_created_at (created_at),
  CONSTRAINT fk_hiring_resume_parses_candidate_user_id
    FOREIGN KEY (candidate_user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_hiring_resume_parses_resume_doc_id
    FOREIGN KEY (resume_doc_id) REFERENCES user_admin_docs(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_hiring_resume_parses_created_by_user_id
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
);

