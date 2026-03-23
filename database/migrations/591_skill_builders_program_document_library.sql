-- Program-level PDF library per company event; sessions attach copies for curriculum / Note Aid.

CREATE TABLE IF NOT EXISTS skill_builders_event_program_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  company_event_id INT NOT NULL,
  skills_group_id INT NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL DEFAULT 'application/pdf',
  file_size_bytes INT NULL,
  uploaded_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sb_prog_docs_event (company_event_id),
  INDEX idx_sb_prog_docs_agency (agency_id),
  INDEX idx_sb_prog_docs_sg (skills_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE skill_builders_event_session_curriculum
  ADD COLUMN source_program_document_id INT NULL AFTER uploaded_by_user_id,
  ADD INDEX idx_sb_sess_curr_src_prog_doc (source_program_document_id);

ALTER TABLE skill_builders_event_session_curriculum
  ADD CONSTRAINT fk_sb_sess_curr_prog_doc
  FOREIGN KEY (source_program_document_id) REFERENCES skill_builders_event_program_documents(id) ON DELETE SET NULL;
